import "server-only";

import { Prisma, WebhookDeliveryStatus } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { sqlUtcTimestamp } from "@/lib/sqlTimestamp";
import { oidcIssuer } from "@/lib/oidc/config";
import { pairwiseSubject } from "@/lib/oidc/primitives";
import { decryptOidcSecret } from "@/lib/oidc/secrets";
import { describeWebhookFailure, postWebhook, webhookRetryDelayMs, WebhookDeliveryError } from "@/lib/webhooks/delivery";
import { webhookSignatureHeader } from "@/lib/webhooks/signature";
import {
  buildPgEnvelope,
  pgEnvelopeSchema,
  PG_INTEGRATION_USER_AGENT,
  type PgAnyEventType,
  type PgEnvelope,
  type PgEventDto,
  type PgRegistrationDto,
} from "@/lib/pgIntegration/contract";
import { decryptPgIntegrationSecret } from "@/lib/pgIntegration/secrets";
import { resolveIntegrationTarget } from "@/lib/pgIntegration/target";

/*
 * People's Gallery integration delivery (docs/PG_INTEGRATION.md#delivery).
 *
 * Rows are captured by database triggers in the transaction that changed the
 * resource (migration 20261031010000_pg_integration). This worker, running in
 * the one-minute outbox scheduler next to organisation webhooks, claims due
 * rows with FOR UPDATE SKIP LOCKED, builds the strict envelope once from the
 * internal snapshot (computing the pairwise subject), stores it, signs it with
 * the org-webhook scheme and POSTs it. Retries back off with jitter; after the
 * last attempt a row is dead-lettered (FAILED) until an operator redrives it.
 */

export const PG_DELIVERY_MAX_ATTEMPTS = 8;
const STALE_LEASE_MS = 5 * 60_000;
const BATCH_SIZE = 50;
const CONCURRENCY = 5;
/** PG answers these for a malformed envelope: retrying cannot help (contract §1.3). */
const PERMANENT_STATUSES = new Set([400, 413]);

export type LoadedIntegration = {
  id: string;
  endpointUrl: string;
  secretEncrypted: string;
  enabled: boolean;
  allowInternalTarget: boolean;
  oauthClient: { id: string; pairwiseSaltEncrypted: string };
};

export async function loadPgIntegration(): Promise<LoadedIntegration | null> {
  return prisma.pgIntegration.findFirst({
    select: {
      id: true, endpointUrl: true, secretEncrypted: true, enabled: true, allowInternalTarget: true,
      oauthClient: { select: { id: true, pairwiseSaltEncrypted: true } },
    },
  });
}

/** The pairwise subject function of the integration's OAuth client (salt decrypted once). */
export function subjectFunction(integration: Pick<LoadedIntegration, "oauthClient">) {
  const salt = decryptOidcSecret(integration.oauthClient.pairwiseSaltEncrypted);
  return (userId: string) => pairwiseSubject(salt, userId);
}

// ── Envelope building ────────────────────────────────────────────────────

type Snapshot = Record<string, unknown>;

/** Trigger snapshots hold Prisma timestamp(3) values as UTC wall-clock text without a zone. */
export function utcIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** An absolute http(s) URL for a stored cover path, or null (never a relative or other-scheme URL). */
export function absoluteHttpUrl(raw: unknown, base = oidcIssuer()): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim(), `${base}/`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function eventDtoFromSnapshot(snapshot: Snapshot): PgEventDto {
  return {
    kind: "event",
    id: text(snapshot.id),
    occurrenceId: null,
    title: text(snapshot.title),
    slug: text(snapshot.slug),
    startDateTime: utcIso(snapshot.startDateTime) ?? new Date(0).toISOString(),
    endDateTime: utcIso(snapshot.endDateTime),
    timezone: text(snapshot.timezone),
    location: text(snapshot.location),
    coverImageUrl: absoluteHttpUrl(snapshot.coverImageUrl),
    status: snapshot.status as PgEventDto["status"],
    privacyType: snapshot.privacyType as PgEventDto["privacyType"],
  };
}

export function displayNameFor(userName: string | null | undefined, guestName: unknown) {
  return (userName?.trim() || text(guestName).trim() || "Participant").slice(0, 200);
}

export function registrationDto(params: {
  snapshot: Snapshot;
  subject: string | null;
  displayName: string;
}): PgRegistrationDto {
  return {
    id: text(params.snapshot.id),
    status: params.snapshot.status as PgRegistrationDto["status"],
    displayName: params.displayName,
    registeredAt: utcIso(params.snapshot.createdAt) ?? new Date(0).toISOString(),
    checkedInAt: utcIso(params.snapshot.checkedInAt),
    subject: params.subject,
    isCrew: params.snapshot.isCrew === true,
    isMinor: false,
  };
}

type BuildRow = {
  id: string;
  eventType: string;
  organisationId: string | null;
  resourceVersion: bigint;
  snapshot: Prisma.JsonValue;
  createdAt: Date;
};

/** The strict envelope for a captured row, or null when its organisation is gone. */
export async function buildEnvelopeForRow(row: BuildRow, subjectOf: (userId: string) => string): Promise<PgEnvelope | null> {
  const snapshot = (row.snapshot ?? {}) as Snapshot;
  const type = row.eventType as PgAnyEventType;
  let organisation: { id: string; slug: string } | null = null;
  if (row.organisationId) {
    organisation = await prisma.organisation.findUnique({ where: { id: row.organisationId }, select: { id: true, slug: true } });
    if (!organisation) return null;
  }
  const ref = (eventId: unknown) => ({ kind: "event" as const, id: text(eventId), occurrenceId: null });
  let data: unknown;
  switch (type) {
    case "event.created":
      data = { event: eventDtoFromSnapshot(snapshot) };
      break;
    case "event.updated":
      data = { event: eventDtoFromSnapshot(snapshot), changed: Array.isArray(snapshot.changed) ? snapshot.changed : [] };
      break;
    case "event.published":
    case "event.cancelled":
      data = { event: eventDtoFromSnapshot(snapshot), previousStatus: snapshot.previousStatus ?? null };
      break;
    case "event.deleted":
      data = { event: ref(snapshot.id) };
      break;
    case "registration.created":
    case "registration.updated":
    case "registration.status_changed": {
      const userId = typeof snapshot.userId === "string" ? snapshot.userId : null;
      const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
      const registration = registrationDto({
        snapshot,
        subject: userId ? subjectOf(userId) : null,
        displayName: displayNameFor(user?.name, snapshot.guestName),
      });
      data = type === "registration.status_changed"
        ? { event: ref(snapshot.eventId), registration, previousStatus: snapshot.previousStatus ?? null }
        : { event: ref(snapshot.eventId), registration };
      break;
    }
    case "access.changed":
      data = { subject: subjectOf(text(snapshot.userId)), organisationId: text(snapshot.organisationId), eventId: snapshot.eventId ?? null, occurrenceId: null };
      break;
    case "user.sessions_revoked":
      data = { subject: subjectOf(text(snapshot.userId)), reason: snapshot.reason };
      break;
    case "user.deleted":
      data = { subject: subjectOf(text(snapshot.userId)) };
      break;
    default:
      data = snapshot;
  }
  return buildPgEnvelope({
    id: row.id,
    type,
    createdAt: row.createdAt,
    organisation,
    resourceVersion: Number(row.resourceVersion),
    data,
  });
}

/**
 * JSON with object keys sorted at every level. The stored envelope is jsonb
 * (which reorders keys), so this keeps the bytes of a retry identical to the
 * first attempt.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

// ── Worker ───────────────────────────────────────────────────────────────

type ClaimedRow = BuildRow & { payload: Prisma.JsonValue; attempts: number; lockedAt: Date };

async function claim(limit: number, id?: string) {
  const now = new Date();
  const dueBy = new Date(now.getTime() + 1);
  const byId = id ? Prisma.sql`AND "id" = ${id}` : Prisma.empty;
  return prisma.$queryRaw<ClaimedRow[]>`
    UPDATE "PgIntegrationDelivery" AS d
    SET "status" = 'PROCESSING', "lockedAt" = ${sqlUtcTimestamp(now)}, "attempts" = d."attempts" + 1, "lastAttemptAt" = ${sqlUtcTimestamp(now)}
    WHERE d."id" IN (
      SELECT "id" FROM "PgIntegrationDelivery"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${sqlUtcTimestamp(dueBy)} ${byId}
      ORDER BY "nextAttemptAt" ASC, "seq" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING d."id", d."eventType", d."organisationId", d."resourceVersion", d."snapshot", d."payload", d."attempts", d."lockedAt", d."createdAt"
  `;
}

const lease = (row: ClaimedRow) => ({ id: row.id, status: WebhookDeliveryStatus.PROCESSING, lockedAt: row.lockedAt });

export type PgDeliveryOutcome = { id: string; ok: boolean; statusCode: number | null; error: string | null };

async function deliverClaimed(row: ClaimedRow, integration: LoadedIntegration, subjectOf: (userId: string) => string): Promise<PgDeliveryOutcome> {
  let envelope: PgEnvelope | null;
  if (row.payload) {
    envelope = pgEnvelopeSchema.parse(row.payload);
  } else {
    envelope = await buildEnvelopeForRow(row, subjectOf);
    if (!envelope) {
      await prisma.pgIntegrationDelivery.updateMany({
        where: lease(row),
        data: { status: WebhookDeliveryStatus.FAILED, lockedAt: null, snapshot: Prisma.DbNull, lastError: "Skipped: the organisation no longer exists" },
      });
      return { id: row.id, ok: false, statusCode: null, error: "Skipped" };
    }
    // Built once: every retry sends the same envelope; the internal snapshot is dropped.
    await prisma.pgIntegrationDelivery.updateMany({ where: lease(row), data: { payload: envelope as Prisma.InputJsonValue, snapshot: Prisma.DbNull } });
  }

  let statusCode: number | null = null;
  let responseTimeMs: number | null = null;
  let failure: string | null = null;
  let permanent = false;
  try {
    let secret: string;
    try {
      secret = decryptPgIntegrationSecret(integration.secretEncrypted);
    } catch {
      throw new WebhookDeliveryError("Signing secret unreadable; rotate the secret");
    }
    const body = canonicalJson(envelope);
    const result = await postWebhook({
      url: integration.endpointUrl,
      body,
      headers: {
        "content-type": "application/json",
        "user-agent": PG_INTEGRATION_USER_AGENT,
        "x-yuyu-event-id": envelope.id,
        "x-yuyu-event-type": envelope.type,
        "x-yuyu-signature": webhookSignatureHeader(secret, Math.floor(Date.now() / 1000), body),
      },
      resolveTarget: (url) => resolveIntegrationTarget(url, { allowInternalTarget: integration.allowInternalTarget }),
    });
    statusCode = result.statusCode;
    responseTimeMs = result.responseTimeMs;
    if (statusCode < 200 || statusCode > 299) {
      const kind = statusCode >= 300 && statusCode < 400 ? "Redirect not followed" : "Unexpected response";
      failure = `${kind} (HTTP ${statusCode})${result.excerpt ? `: ${result.excerpt}` : ""}`;
      permanent = PERMANENT_STATUSES.has(statusCode);
    }
  } catch (error) {
    failure = describeWebhookFailure(error);
    permanent = error instanceof WebhookDeliveryError && error.permanent;
  }

  const now = new Date();
  if (!failure) {
    await prisma.pgIntegrationDelivery.updateMany({
      where: lease(row),
      data: { status: WebhookDeliveryStatus.SUCCEEDED, lockedAt: null, deliveredAt: now, lastStatusCode: statusCode, responseTimeMs, lastError: null },
    });
    await prisma.pgIntegration.update({ where: { id: integration.id }, data: { lastSuccessAt: now } });
    return { id: row.id, ok: true, statusCode, error: null };
  }
  const terminal = permanent || row.attempts >= PG_DELIVERY_MAX_ATTEMPTS;
  await prisma.pgIntegrationDelivery.updateMany({
    where: lease(row),
    data: {
      status: terminal ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
      lockedAt: null,
      nextAttemptAt: terminal ? now : new Date(now.getTime() + webhookRetryDelayMs(row.attempts)),
      lastStatusCode: statusCode,
      responseTimeMs,
      lastError: failure.slice(0, 300),
    },
  });
  await prisma.pgIntegration.update({ where: { id: integration.id }, data: { lastFailureAt: now } });
  return { id: row.id, ok: false, statusCode, error: failure };
}

async function runWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) results.push(await work(items[next++]!));
  }));
  return results;
}

/**
 * One worker pass. Nothing is claimed while the integration is missing or
 * switched off, so queued rows wait (they are never lost). Never throws for an
 * individual delivery.
 */
export async function deliverPgIntegrationBatch(limit = BATCH_SIZE, options: { deliveryId?: string } = {}) {
  const integration = await loadPgIntegration();
  if (!integration?.enabled) return { delivered: 0, failed: 0 };
  await prisma.pgIntegrationDelivery.updateMany({
    where: { status: WebhookDeliveryStatus.PROCESSING, lockedAt: { lt: new Date(Date.now() - STALE_LEASE_MS) } },
    data: { status: WebhookDeliveryStatus.PENDING, lockedAt: null },
  });
  const subjectOf = subjectFunction(integration);
  const rows = await claim(Math.min(Math.max(limit, 1), 200), options.deliveryId);
  const outcomes = await runWithConcurrency(rows, CONCURRENCY, (row) =>
    deliverClaimed(row, integration, subjectOf).catch(async (error: unknown) => {
      // A snapshot or stored envelope that fails its strict schema can never
      // succeed: dead-letter it at once. Anything else (a database blip while
      // building) is retried, but never past the attempt cap.
      const terminal = error instanceof ZodError || row.attempts >= PG_DELIVERY_MAX_ATTEMPTS;
      await prisma.pgIntegrationDelivery.updateMany({
        where: lease(row),
        data: terminal
          ? { status: WebhookDeliveryStatus.FAILED, lockedAt: null, lastError: error instanceof ZodError ? "Envelope failed its schema" : "Delivery failed" }
          : { status: WebhookDeliveryStatus.PENDING, lockedAt: null, nextAttemptAt: new Date(Date.now() + webhookRetryDelayMs(row.attempts)) },
      }).catch(() => undefined);
      return { id: row.id, ok: false, statusCode: null, error: "Delivery failed" } satisfies PgDeliveryOutcome;
    }),
  );
  return { delivered: outcomes.filter((outcome) => outcome.ok).length, failed: outcomes.filter((outcome) => !outcome.ok).length };
}

/** Delivery history (and deleted-resource tombstones) are kept 30 days. */
export const PG_DELIVERY_RETENTION_DAYS = 30;
