import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { EventPermission, MembershipRole, Prisma, RsvpStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimitById } from "@/lib/rateLimit";
import { authenticateClientToken } from "@/lib/oidc/provider";
import {
  PG_INTEGRATION_SCOPE,
  pgApiEventItemSchema,
  pgApiEventRoleItemSchema,
  pgApiListQuerySchema,
  pgApiOrganisationSchema,
  pgApiRegistrationItemSchema,
  pgApiUserRolesSchema,
  pgPage,
  pgRoleFor,
  subjectSchema,
} from "@/lib/pgIntegration/contract";
import {
  absoluteHttpUrl,
  displayNameFor,
  loadPgIntegration,
  isMinorAttestation,
  registrationDto,
  subjectFunction,
  type LoadedIntegration,
} from "@/lib/pgIntegration/delivery";

/*
 * People's Gallery integration API, /api/integrations/pg/v1
 * (docs/PG_INTEGRATION.md#integration-api). Bearer `yoi_` tokens from
 * client_credentials with scope `yuyu.integration`, issued only to the OAuth
 * client linked to the integration. Only organisations enabled for the
 * integration are visible; anything else answers 404. Responses are strict
 * DTOs (subjects, never user ids or contact data), `no-store`.
 */

export type PgApiErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CREDENTIAL"
  | "INSUFFICIENT_SCOPE"
  | "RESOURCE_NOT_FOUND"
  | "RATE_LIMITED"
  | "INTEGRATION_DISABLED"
  | "IDEMPOTENCY_CONFLICT"
  | "TICKET_USED"
  | "INTERNAL_ERROR";

const MESSAGES: Record<PgApiErrorCode, string> = {
  INVALID_REQUEST: "The request is invalid.",
  INVALID_CREDENTIAL: "A valid integration access token is required.",
  INSUFFICIENT_SCOPE: "The token does not grant the yuyu.integration scope for this integration.",
  RESOURCE_NOT_FOUND: "The requested resource was not found.",
  RATE_LIMITED: "Too many requests. Try again later.",
  INTEGRATION_DISABLED: "The People's Gallery integration is not enabled.",
  IDEMPOTENCY_CONFLICT: "This Idempotency-Key was already used with a different request.",
  TICKET_USED: "This enrollment ticket was already used for another enrollment.",
  INTERNAL_ERROR: "The request could not be completed.",
};

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

export function pgApiError(code: PgApiErrorCode, status: number, retryAfter?: number) {
  const headers: Record<string, string> = { ...NO_STORE };
  if (status === 401) headers["WWW-Authenticate"] = 'Bearer realm="yuyu-pg-integration", error="invalid_token"';
  if (status === 403) headers["WWW-Authenticate"] = 'Bearer realm="yuyu-pg-integration", error="insufficient_scope", scope="yuyu.integration"';
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json({ error: { code, message: MESSAGES[code] } }, { status, headers });
}

export function pgApiJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

const MAX_BODY_BYTES = 256 * 1024;

/** A bounded, strictly validated JSON body (application/json only), or null. */
export async function readPgJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> {
  if (!/^application\/json(\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type PgApiContext = { integration: LoadedIntegration; subjectOf: (userId: string) => string };

function bearer(header: string | null) {
  const match = header?.trim().match(/^Bearer[ \t]+([^ \t]+)$/i);
  return match?.[1] ?? null;
}

/** Authenticate, check scope and integration, rate limit, then run the operation. */
export async function handlePgIntegrationRequest(request: Request, operation: (context: PgApiContext) => Promise<Response>) {
  try {
    const token = bearer(request.headers.get("authorization"));
    const auth = token ? await authenticateClientToken(token) : null;
    if (!auth) return pgApiError("INVALID_CREDENTIAL", 401);
    if (!auth.scopes.includes(PG_INTEGRATION_SCOPE)) return pgApiError("INSUFFICIENT_SCOPE", 403);
    const integration = await loadPgIntegration();
    if (!integration?.enabled) return pgApiError("INTEGRATION_DISABLED", 503, 300);
    if (integration.oauthClient.id !== auth.clientId) return pgApiError("INSUFFICIENT_SCOPE", 403);
    const key = `pg-integration:${crypto.createHash("sha256").update(auth.clientId).digest("hex").slice(0, 32)}`;
    if (!(await checkRateLimitById("pgIntegrationApi", key))) return pgApiError("RATE_LIMITED", 429, 60);
    return await operation({ integration, subjectOf: subjectFunction(integration) });
  } catch {
    console.error("[pg-integration] api request failed");
    return pgApiError("INTERNAL_ERROR", 500);
  }
}

// ── Query parsing and cursors ────────────────────────────────────────────

export function parseListQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in raw) return null;
    raw[key] = value;
  }
  const parsed = pgApiListQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const resourceCursorSchema = z.object({ v: z.literal(1), t: z.string().datetime(), k: z.string().min(1).max(300) }).strict();
const subjectCursorSchema = z.object({ v: z.literal(1), s: subjectSchema }).strict();

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode<T>(schema: z.ZodType<T>, value: string | undefined): T | null | undefined {
  if (!value) return undefined;
  try {
    return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

const REPEATABLE_READ = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead } as const;

async function enabledOrganisationIds(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const rows = await client.pgIntegrationOrganisation.findMany({ select: { organisationId: true } });
  return rows.map((row) => row.organisationId);
}

// ── GET /organisations ───────────────────────────────────────────────────

export async function listPgOrganisations() {
  const rows = await prisma.pgIntegrationOrganisation.findMany({
    orderBy: { enabledAt: "asc" },
    select: { enabledAt: true, organisation: { select: { id: true, slug: true, name: true } } },
  });
  return {
    data: rows.map((row) => pgApiOrganisationSchema.parse({ ...row.organisation, enabledAt: row.enabledAt.toISOString() })),
  };
}

// ── GET /events ──────────────────────────────────────────────────────────

const eventPage = pgPage(pgApiEventItemSchema);

export async function listPgEvents(query: NonNullable<ReturnType<typeof parseListQuery>>) {
  const cursor = decode(resourceCursorSchema, query.cursor);
  if (cursor === null) return null;
  return prisma.$transaction(async (tx) => {
    const enabled = await enabledOrganisationIds(tx);
    const orgIds = query.organisationId ? enabled.filter((orgId) => orgId === query.organisationId) : enabled;
    if (query.organisationId && orgIds.length === 0) return "not_found" as const;
    const where: Prisma.PgIntegrationResourceWhereInput = {
      kind: "event",
      organisationId: { in: orgIds },
      ...(query.updatedSince ? { updatedAt: { gt: new Date(query.updatedSince) } } : {}),
      ...(cursor
        ? { OR: [{ updatedAt: { gt: new Date(cursor.t) } }, { updatedAt: new Date(cursor.t), key: { gt: cursor.k } }] }
        : {}),
    };
    const resources = await tx.pgIntegrationResource.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { key: "asc" }],
      take: query.limit + 1,
      select: { key: true, resourceId: true, organisationId: true, version: true, deletedAt: true, updatedAt: true },
    });
    const page = resources.slice(0, query.limit);
    const [events, organisations] = await Promise.all([
      tx.event.findMany({
        where: { id: { in: page.filter((row) => !row.deletedAt).map((row) => row.resourceId) } },
        select: {
          id: true, organisationId: true, title: true, slug: true, startDateTime: true, endDateTime: true,
          timezone: true, location: true, coverImageUrl: true, status: true, privacyType: true,
        },
      }),
      tx.organisation.findMany({ where: { id: { in: orgIds } }, select: { id: true, slug: true } }),
    ]);
    const eventById = new Map(events.map((event) => [event.id, event]));
    const orgById = new Map(organisations.map((org) => [org.id, org]));
    const data = page.flatMap((row) => {
      const organisation = row.organisationId ? orgById.get(row.organisationId) : undefined;
      if (!organisation) return [];
      const event = row.deletedAt ? undefined : eventById.get(row.resourceId);
      return [pgApiEventItemSchema.parse({
        organisation,
        resourceVersion: Number(row.version),
        deleted: !event,
        event: event
          ? {
              kind: "event", id: event.id, occurrenceId: null, title: event.title, slug: event.slug,
              startDateTime: event.startDateTime.toISOString(), endDateTime: event.endDateTime.toISOString(),
              timezone: event.timezone, location: event.location, coverImageUrl: absoluteHttpUrl(event.coverImageUrl),
              status: event.status, privacyType: event.privacyType,
            }
          : { kind: "event", id: row.resourceId, occurrenceId: null },
      })];
    });
    const last = page.at(-1);
    return eventPage.parse({
      data,
      pagination: { nextCursor: resources.length > query.limit && last ? encode({ v: 1, t: last.updatedAt.toISOString(), k: last.key }) : null },
    });
  }, REPEATABLE_READ);
}

/** The event when it is (or was, for a tombstone) in an enabled organisation. */
async function visibleEvent(tx: Prisma.TransactionClient, eventId: string) {
  const enabled = await enabledOrganisationIds(tx);
  const event = await tx.event.findFirst({ where: { id: eventId, organisationId: { in: enabled } }, select: { id: true, organisationId: true } });
  if (event) return event;
  const tombstone = await tx.pgIntegrationResource.findFirst({
    where: { key: `event:${eventId}:`, organisationId: { in: enabled } },
    select: { resourceId: true, organisationId: true },
  });
  return tombstone?.organisationId ? { id: tombstone.resourceId, organisationId: tombstone.organisationId } : null;
}

// ── GET /events/{eventId}/registrations ──────────────────────────────────

const registrationPage = pgPage(pgApiRegistrationItemSchema);
const tombstoneSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  status: z.string(),
  isCrew: z.boolean(),
  createdAt: z.string(),
  checkedInAt: z.string().nullable(),
}).passthrough();

export async function listPgRegistrations(eventId: string, query: NonNullable<ReturnType<typeof parseListQuery>>, subjectOf: (userId: string) => string) {
  const cursor = decode(resourceCursorSchema, query.cursor);
  if (cursor === null || query.organisationId) return null;
  return prisma.$transaction(async (tx) => {
    const event = await visibleEvent(tx, eventId);
    if (!event) return "not_found" as const;
    const resources = await tx.pgIntegrationResource.findMany({
      where: {
        kind: "registration",
        eventId: event.id,
        ...(query.updatedSince ? { updatedAt: { gt: new Date(query.updatedSince) } } : {}),
        ...(cursor
          ? { OR: [{ updatedAt: { gt: new Date(cursor.t) } }, { updatedAt: new Date(cursor.t), key: { gt: cursor.k } }] }
          : {}),
      },
      orderBy: [{ updatedAt: "asc" }, { key: "asc" }],
      take: query.limit + 1,
      select: { key: true, resourceId: true, version: true, deletedAt: true, tombstone: true, updatedAt: true },
    });
    const page = resources.slice(0, query.limit);
    const rsvps = await tx.rSVP.findMany({
      where: { eventId: event.id, id: { in: page.filter((row) => !row.deletedAt).map((row) => row.resourceId) } },
      select: { id: true, userId: true, guestName: true, status: true, isCrew: true, createdAt: true, checkedInAt: true, user: { select: { name: true } }, pgFaceConsent: { select: { ageAttestation: true, userId: true } } },
    });
    const byId = new Map(rsvps.map((rsvp) => [rsvp.id, rsvp]));
    const data = page.flatMap((row) => {
      const rsvp = row.deletedAt ? undefined : byId.get(row.resourceId);
      if (rsvp) {
        return [pgApiRegistrationItemSchema.parse({
          resourceVersion: Number(row.version),
          registration: registrationDto({
            snapshot: { id: rsvp.id, status: rsvp.status, isCrew: rsvp.isCrew, createdAt: rsvp.createdAt.toISOString(), checkedInAt: rsvp.checkedInAt?.toISOString() ?? null },
            subject: rsvp.userId ? subjectOf(rsvp.userId) : null,
            displayName: displayNameFor(rsvp.user?.name, rsvp.guestName),
            isMinor: isMinorAttestation(rsvp.pgFaceConsent, rsvp.userId),
          }),
        })];
      }
      const tombstone = tombstoneSchema.safeParse(row.tombstone);
      const status = tombstone.success && tombstone.data.status === "REMOVED" ? "REMOVED" : "CANCELLED";
      return [pgApiRegistrationItemSchema.parse({
        resourceVersion: Number(row.version),
        registration: registrationDto({
          snapshot: {
            id: row.resourceId,
            status,
            isCrew: tombstone.success ? tombstone.data.isCrew : false,
            createdAt: tombstone.success ? tombstone.data.createdAt : null,
            checkedInAt: tombstone.success ? tombstone.data.checkedInAt : null,
          },
          subject: tombstone.success && tombstone.data.userId ? subjectOf(tombstone.data.userId) : null,
          displayName: "Participant",
        }),
      })];
    });
    const last = page.at(-1);
    return registrationPage.parse({
      data,
      pagination: { nextCursor: resources.length > query.limit && last ? encode({ v: 1, t: last.updatedAt.toISOString(), k: last.key }) : null },
    });
  }, REPEATABLE_READ);
}

// ── GET /events/{eventId}/roles ──────────────────────────────────────────

const rolePage = pgPage(pgApiEventRoleItemSchema);

/** Effective D-2 role facts for everyone with organisation or collaborator access to the event. */
export async function listPgEventRoles(eventId: string, query: NonNullable<ReturnType<typeof parseListQuery>>, subjectOf: (userId: string) => string) {
  const cursor = decode(subjectCursorSchema, query.cursor);
  if (cursor === null || query.organisationId || query.updatedSince) return null;
  return prisma.$transaction(async (tx) => {
    const enabled = await enabledOrganisationIds(tx);
    const event = await tx.event.findFirst({ where: { id: eventId, organisationId: { in: enabled } }, select: { id: true, organisationId: true } });
    if (!event) return "not_found" as const;
    const [memberships, collaborators] = await Promise.all([
      tx.membership.findMany({ where: { organisationId: event.organisationId }, select: { userId: true, role: true } }),
      tx.eventCollaborator.findMany({ where: { eventId: event.id }, select: { userId: true, permissions: true } }),
    ]);
    const facts = new Map<string, { orgRole: MembershipRole | null; collaboratorPermissions: EventPermission[] }>();
    for (const membership of memberships) facts.set(membership.userId, { orgRole: membership.role, collaboratorPermissions: [] });
    for (const collaborator of collaborators) {
      const existing = facts.get(collaborator.userId) ?? { orgRole: null, collaboratorPermissions: [] };
      existing.collaboratorPermissions = [...collaborator.permissions].sort();
      facts.set(collaborator.userId, existing);
    }
    const all = [...facts.entries()]
      .map(([userId, fact]) => ({ subject: subjectOf(userId), ...fact, pgRole: pgRoleFor(fact) }))
      .sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0));
    const start = cursor ? all.findIndex((item) => item.subject > cursor.s) : 0;
    const remaining = start < 0 ? [] : all.slice(start);
    const page = remaining.slice(0, query.limit);
    return rolePage.parse({
      data: page.map((item) => pgApiEventRoleItemSchema.parse(item)),
      pagination: { nextCursor: remaining.length > query.limit ? encode({ v: 1, s: page.at(-1)!.subject }) : null },
    });
  }, REPEATABLE_READ);
}

// ── GET /users/{subject}/roles ───────────────────────────────────────────

const MAX_ROLE_EVENTS = 500;

/** Resolve a subject to the Yuyu user holding a live grant to the integration's client. */
async function userForSubject(integration: LoadedIntegration, subject: string, subjectOf: (userId: string) => string) {
  const grant = await prisma.oAuthGrant.findFirst({
    where: { clientId: integration.oauthClient.id, subject, revokedAt: null },
    select: { userId: true },
  });
  if (grant) return grant.userId;
  // Grants approved before subjects were stored: fill them once, then retry.
  const missing = await prisma.oAuthGrant.findMany({ where: { clientId: integration.oauthClient.id, subject: null }, select: { id: true, userId: true }, take: 5000 });
  let found: string | null = null;
  for (const row of missing) {
    const computed = subjectOf(row.userId);
    await prisma.oAuthGrant.updateMany({ where: { id: row.id, subject: null }, data: { subject: computed } });
    if (computed === subject) found = row.userId;
  }
  if (!found) return null;
  const live = await prisma.oAuthGrant.findFirst({ where: { clientId: integration.oauthClient.id, userId: found, revokedAt: null }, select: { userId: true } });
  return live?.userId ?? null;
}

export async function pgUserRoles(context: PgApiContext, subject: string) {
  if (!subjectSchema.safeParse(subject).success) return "not_found" as const;
  const userId = await userForSubject(context.integration, subject, context.subjectOf);
  if (!userId) return "not_found" as const;
  return prisma.$transaction(async (tx) => {
    const enabled = await enabledOrganisationIds(tx);
    const [memberships, collaborations, registrations] = await Promise.all([
      tx.membership.findMany({
        where: { userId, organisationId: { in: enabled } },
        orderBy: { organisationId: "asc" },
        select: { role: true, organisation: { select: { id: true, slug: true } } },
      }),
      tx.eventCollaborator.findMany({
        where: { userId, event: { organisationId: { in: enabled } } },
        take: MAX_ROLE_EVENTS,
        select: { permissions: true, event: { select: { id: true, organisationId: true } } },
      }),
      tx.rSVP.findMany({
        where: { userId, event: { organisationId: { in: enabled } } },
        orderBy: { createdAt: "desc" },
        take: MAX_ROLE_EVENTS,
        select: { id: true, status: true, isCrew: true, event: { select: { id: true, organisationId: true } } },
      }),
    ]);
    type EventFacts = { organisationId: string; eventId: string; occurrenceId: null; collaboratorPermissions: EventPermission[]; registration: { id: string; status: RsvpStatus; isCrew: boolean } | null };
    const events = new Map<string, EventFacts>();
    const entry = (event: { id: string; organisationId: string }) => {
      const existing = events.get(event.id) ?? { organisationId: event.organisationId, eventId: event.id, occurrenceId: null, collaboratorPermissions: [], registration: null };
      events.set(event.id, existing);
      return existing;
    };
    for (const collaboration of collaborations) if (collaboration.event) entry(collaboration.event).collaboratorPermissions = [...collaboration.permissions].sort();
    for (const rsvp of registrations) if (rsvp.event) entry(rsvp.event).registration = { id: rsvp.id, status: rsvp.status, isCrew: rsvp.isCrew };
    return {
      data: pgApiUserRolesSchema.parse({
        subject,
        organisations: memberships.map((membership) => ({ ...membership.organisation, role: membership.role })),
        events: [...events.values()].sort((a, b) => (a.eventId < b.eventId ? -1 : 1)),
      }),
    };
  }, REPEATABLE_READ);
}
