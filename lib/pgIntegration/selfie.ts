import "server-only";

import { Prisma, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { oidcIssuer } from "@/lib/oidc/config";
import { FACE_NOTICE_VERSION } from "@/lib/pgIntegration/faceNotice";
import { decryptPgIntegrationSecret } from "@/lib/pgIntegration/secrets";
import { loadPgIntegration, subjectFunction, type LoadedIntegration } from "@/lib/pgIntegration/delivery";
import { mintEnrollmentTicket, TICKET_TTL_SECONDS } from "@/lib/pgIntegration/enrollmentTicket";
import { PG_MAX_REVOKED_JTIS, type PgEnrollmentStatus, type PgSelfieState } from "@/lib/pgIntegration/contract";

/*
 * The selfie step (docs/PG_INTEGRATION.md#selfie-step, decision D-Selfie).
 *
 * Yuyu owns the consent record and the age attestation, and mints a
 * short-lived ticket with which the browser or app uploads the selfie
 * straight to People's Gallery. Yuyu never receives, stores, hashes or logs
 * the image: nothing here accepts bytes. People's Gallery reports what
 * happened through the integration API (applyEnrollmentStatus), and every
 * change is mirrored to it through the signed outbox in the same transaction.
 */

export const SELFIE_TICKETS_PER_HOUR = 5;
/** PG's status callback may arrive a little after the ticket expired (slow upload, queue). */
const CALLBACK_GRACE_MS = 24 * 60 * 60_000;
/** Contract v1.2 §4.2: PG's canonical selfie upload path (PG also serves the older /api/v2/enrollments alias). */
export const ENROLLMENT_PATH = "/api/v2/integrations/yuyu/selfies";

type Tx = Prisma.TransactionClient;

export type FaceMatchingUnavailable =
  | "not_found"
  | "not_enabled"
  | "not_confirmed"
  | "series"
  | "event_over";

export type FaceMatchingState = {
  ageAttestation: "ADULT" | "MINOR" | null;
  /** Consent given to the current notice and not withdrawn. */
  active: boolean;
  /** Consent was given once and later withdrawn. */
  withdrawn: boolean;
  /** Agreed to an older notice: must agree again before a new selfie. */
  needsNewConsent: boolean;
  selfieState: PgSelfieState;
  rejectedReason: string | null;
  selfieUpdatedAt: string | null;
};

export type FaceMatchingView =
  | { available: true; rsvpId: string; eventTitle: string; state: FaceMatchingState }
  | { available: false; reason: FaceMatchingUnavailable };

/** Integration on, with a public upload origin, and the organisation shared with PG. */
async function integrationFor(organisationId: string): Promise<LoadedIntegration & { publicUrl: string } | null> {
  const integration = await loadPgIntegration();
  if (!integration?.enabled) return null;
  const row = await prisma.pgIntegration.findUnique({ where: { id: integration.id }, select: { publicUrl: true } });
  if (!row?.publicUrl) return null;
  const shared = await prisma.pgIntegrationOrganisation.findUnique({ where: { organisationId }, select: { organisationId: true } });
  return shared ? { ...integration, publicUrl: row.publicUrl } : null;
}

/** Is "Photos by People's Gallery" on for this organisation (selfie step shown)? */
export async function pgPhotosEnabledFor(organisationId: string) {
  return Boolean(await integrationFor(organisationId));
}

const rsvpSelect = {
  id: true,
  userId: true,
  status: true,
  eventId: true,
  event: { select: { id: true, title: true, organisationId: true, endDateTime: true } },
  pgFaceConsent: true,
} satisfies Prisma.RSVPSelect;
type RsvpRow = Prisma.RSVPGetPayload<{ select: typeof rsvpSelect }>;

function stateOf(consent: RsvpRow["pgFaceConsent"], userId: string): FaceMatchingState {
  const own = consent && consent.userId === userId ? consent : null;
  const active = Boolean(own?.grantedAt && !own.withdrawnAt && own.noticeVersion === FACE_NOTICE_VERSION);
  return {
    ageAttestation: (own?.ageAttestation as "ADULT" | "MINOR" | undefined) ?? null,
    active,
    withdrawn: Boolean(own?.withdrawnAt),
    needsNewConsent: Boolean(own?.grantedAt && !own.withdrawnAt && own.noticeVersion !== FACE_NOTICE_VERSION),
    selfieState: (own?.selfieState as PgSelfieState | undefined) ?? "NONE",
    rejectedReason: own?.rejectedReason ?? null,
    selfieUpdatedAt: own?.selfieUpdatedAt?.toISOString() ?? null,
  };
}

/**
 * Only the account that owns the registration, for a CONFIRMED registration
 * of a one-off event in an organisation shared with PG, before the event's
 * photo retention ends. Anyone else's registration is `not_found`.
 */
async function eligible(userId: string, rsvpId: string, now = new Date()) {
  if (!rsvpId || rsvpId.length > 128) return { ok: false as const, reason: "not_found" as const };
  const rsvp = await prisma.rSVP.findFirst({ where: { id: rsvpId, userId }, select: rsvpSelect });
  if (!rsvp) return { ok: false as const, reason: "not_found" as const };
  if (!rsvp.event || !rsvp.eventId) return { ok: false as const, reason: "series" as const };
  const integration = await integrationFor(rsvp.event.organisationId);
  if (!integration) return { ok: false as const, reason: "not_enabled" as const };
  if (rsvp.status !== RsvpStatus.CONFIRMED) return { ok: false as const, reason: "not_confirmed" as const };
  // Decision D-7: selfies and matches live 180 days after the event ends.
  if (rsvp.event.endDateTime.getTime() + 180 * 86_400_000 < now.getTime()) return { ok: false as const, reason: "event_over" as const };
  return { ok: true as const, rsvp, event: rsvp.event, integration };
}

export async function loadFaceMatchingView(userId: string, rsvpId: string): Promise<FaceMatchingView> {
  const result = await eligible(userId, rsvpId);
  if (!result.ok) return { available: false, reason: result.reason };
  return { available: true, rsvpId: result.rsvp.id, eventTitle: result.event.title, state: stateOf(result.rsvp.pgFaceConsent, userId) };
}

/** Face-matching records of the signed-in person (Account → Privacy). Own rows only. */
export async function listFaceMatchingForUser(userId: string) {
  const rows = await prisma.pgFaceConsent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      rsvpId: true, ageAttestation: true, grantedAt: true, withdrawnAt: true, selfieState: true, noticeVersion: true,
      rsvp: { select: { checkInToken: true, userId: true, event: { select: { title: true, startDateTime: true, timezone: true } } } },
    },
  });
  return rows
    .filter((row) => row.rsvp.userId === userId && row.rsvp.event)
    .map((row) => ({
      rsvpId: row.rsvpId,
      eventTitle: row.rsvp.event!.title,
      startDateTime: row.rsvp.event!.startDateTime,
      timezone: row.rsvp.event!.timezone,
      ticketPath: `/ticket/${row.rsvp.checkInToken}`,
      minor: row.ageAttestation === "MINOR",
      active: Boolean(row.grantedAt && !row.withdrawnAt),
      selfieState: row.selfieState as PgSelfieState,
    }));
}

// ── Outbox capture (same transaction as the change) ──────────────────────

type CaptureType = "selfie.added" | "selfie.removed" | "consent.granted" | "consent.withdrawn" | "registration.updated";

/**
 * Queue one signed delivery through the migration's enqueue function, which
 * bumps the resource version under a row lock. Skipped while the integration
 * is off or the organisation is not shared (like the capture triggers).
 */
export async function capturePgEventTx(tx: Tx, params: {
  type: CaptureType;
  organisationId: string | null;
  kind: "selfie" | "consent" | "registration";
  resourceId: string;
  eventId: string | null;
  key: string;
  snapshot: Record<string, unknown>;
}) {
  const [gate] = await tx.$queryRaw<{ on: boolean }[]>`
    SELECT CASE WHEN ${params.organisationId}::text IS NULL THEN "pg_integration_client"() IS NOT NULL
                ELSE "pg_integration_org_enabled"(${params.organisationId}::text) END AS "on"`;
  if (!gate?.on) return false;
  await tx.$executeRaw`SELECT "pg_integration_enqueue"(
    ${params.type}::text, ${params.organisationId}::text, ${params.kind}::text, ${params.resourceId}::text, ${params.eventId}::text,
    ${params.key}::text, ${JSON.stringify(params.snapshot)}::jsonb, false, NULL::jsonb)`;
  return true;
}

type ConsentRow = { id: string; rsvpId: string; userId: string; eventId: string; organisationId: string; enrollmentId: string | null };

function selfieCapture(tx: Tx, type: "selfie.added" | "selfie.removed", consent: ConsentRow, enrollmentId: string) {
  return capturePgEventTx(tx, {
    type, organisationId: consent.organisationId, kind: "selfie", resourceId: consent.rsvpId, eventId: consent.eventId,
    key: `selfie:${consent.rsvpId}`, snapshot: { rsvpId: consent.rsvpId, userId: consent.userId, enrollmentId },
  });
}

function withdrawnCapture(tx: Tx, consent: ConsentRow, withdrawnAt: Date, revokedJtis: string[]) {
  return capturePgEventTx(tx, {
    type: "consent.withdrawn", organisationId: consent.organisationId, kind: "consent", resourceId: consent.rsvpId, eventId: consent.eventId,
    key: `consent:${consent.rsvpId}`,
    snapshot: { rsvpId: consent.rsvpId, userId: consent.userId, scope: "event", withdrawnAt: withdrawnAt.toISOString(), revokedJtis },
  });
}

/** registration.updated with the current row, so PG learns `isMinor`. */
async function registrationCapture(tx: Tx, rsvpId: string) {
  const rsvp = await tx.rSVP.findUnique({
    where: { id: rsvpId },
    select: { id: true, eventId: true, userId: true, guestName: true, status: true, isCrew: true, createdAt: true, checkedInAt: true, event: { select: { organisationId: true } } },
  });
  if (!rsvp?.eventId || !rsvp.event) return false;
  return capturePgEventTx(tx, {
    type: "registration.updated", organisationId: rsvp.event.organisationId, kind: "registration", resourceId: rsvp.id, eventId: rsvp.eventId,
    key: `registration:${rsvp.id}`,
    snapshot: {
      id: rsvp.id, eventId: rsvp.eventId, userId: rsvp.userId, guestName: rsvp.guestName, status: rsvp.status, previousStatus: null,
      isCrew: rsvp.isCrew, createdAt: rsvp.createdAt.toISOString(), checkedInAt: rsvp.checkedInAt?.toISOString() ?? null,
    },
  });
}

/**
 * Withdraw one consent row inside a transaction; emits consent.withdrawn and
 * selfie.removed. Returns whether it changed and the ids of the unexpired,
 * unused tickets it revoked: they go to PG in consent.withdrawn (`revokedJtis`,
 * security review Y-2), so a ticket minted just before the withdrawal can no
 * longer enroll there.
 */
async function withdrawConsentTx(tx: Tx, consent: ConsentRow & { grantedAt: Date | null; withdrawnAt: Date | null }, now: Date, emitWithdrawn: boolean) {
  if (!consent.grantedAt || consent.withdrawnAt) return { changed: false, revokedJtis: [] as string[] };
  await tx.pgFaceConsent.update({
    where: { id: consent.id },
    data: { withdrawnAt: now, selfieState: "REMOVED", enrollmentId: null, rejectedReason: null, selfieUpdatedAt: now },
  });
  const open = await tx.pgSelfieTicket.findMany({
    where: { consentId: consent.id, usedAt: null, expiresAt: { gt: now } },
    select: { jti: true },
    orderBy: { issuedAt: "desc" },
    take: PG_MAX_REVOKED_JTIS,
  });
  const revokedJtis = open.map((ticket) => ticket.jti);
  // Outstanding tickets can no longer confirm a selfie for this consent.
  await tx.pgSelfieTicket.updateMany({ where: { consentId: consent.id, usedAt: null }, data: { usedAt: now } });
  if (emitWithdrawn) await withdrawnCapture(tx, consent, now, revokedJtis);
  if (consent.enrollmentId) await selfieCapture(tx, "selfie.removed", consent, consent.enrollmentId);
  return { changed: true, revokedJtis };
}

// ── Attendee actions (Server Actions and the mobile API call these) ──────

export type SelfieActionError = FaceMatchingUnavailable | "minor" | "consent_required" | "rate_limited";

/** "I am under 18": recorded once per registration; face matching stays off (D-12). */
export async function recordUnder18Attestation(userId: string, rsvpId: string): Promise<{ ok: true } | { ok: false; error: SelfieActionError }> {
  const result = await eligible(userId, rsvpId);
  if (!result.ok) return { ok: false, error: result.reason };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.pgFaceConsent.findUnique({ where: { rsvpId } });
    if (existing?.ageAttestation === "MINOR" && existing.userId === userId) return;
    if (existing) {
      await withdrawConsentTx(tx, existing, now, true);
      await tx.pgFaceConsent.update({
        where: { id: existing.id },
        data: { userId, ageAttestation: "MINOR", ageAttestedAt: now, grantedAt: null, noticeVersion: null },
      });
    } else {
      await tx.pgFaceConsent.create({
        data: { rsvpId, userId, eventId: result.event.id, organisationId: result.event.organisationId, ageAttestation: "MINOR", ageAttestedAt: now },
      });
    }
    await registrationCapture(tx, rsvpId);
    await recordAuditEvent({
      client: tx, action: "PG_FACE_AGE_UNDER_18", actorUserId: userId, organisationId: result.event.organisationId,
      targetType: "RSVP", targetId: rsvpId,
    });
  });
  return { ok: true };
}

export type SelfieTicketResult =
  | { ok: true; ticket: string; uploadUrl: string; expiresAt: string; noticeVersion: string; action: "add" | "replace" }
  | { ok: false; error: SelfieActionError };

/**
 * Records consent to the current notice and the 18+ attestation, then mints
 * a 10-minute single-use ticket for an upload straight to People's Gallery.
 * The caller must pass `consent: true` and `adult: true` explicitly in this
 * request (validated by the Zod schema at the boundary).
 */
export async function issueSelfieTicket(userId: string, rsvpId: string, input: { noticeVersion: string }, now = new Date()): Promise<SelfieTicketResult> {
  const result = await eligible(userId, rsvpId, now);
  if (!result.ok) return { ok: false, error: result.reason };
  if (input.noticeVersion !== FACE_NOTICE_VERSION) return { ok: false, error: "consent_required" };
  const { event, integration } = result;
  const subject = subjectFunction(integration)(userId);
  let secret: string;
  try {
    // Key v2: the dedicated ticket secret; legacy v1 (delivery secret) until one is set.
    secret = decryptPgIntegrationSecret(integration.ticketSecretEncrypted ?? integration.secretEncrypted);
  } catch {
    return { ok: false, error: "not_enabled" };
  }

  return prisma.$transaction(async (tx): Promise<SelfieTicketResult> => {
    // One writer per registration at a time.
    await tx.$queryRaw`SELECT "id" FROM "RSVP" WHERE "id" = ${rsvpId} FOR UPDATE`;
    let consent = await tx.pgFaceConsent.findUnique({ where: { rsvpId } });
    if (consent?.ageAttestation === "MINOR" && consent.userId === userId) return { ok: false, error: "minor" };
    const recent = await tx.pgSelfieTicket.count({ where: { userId, issuedAt: { gt: new Date(now.getTime() - 3_600_000) } } });
    if (recent >= SELFIE_TICKETS_PER_HOUR) return { ok: false, error: "rate_limited" };

    const needsGrant = !consent || consent.userId !== userId || !consent.grantedAt || Boolean(consent.withdrawnAt) || consent.noticeVersion !== FACE_NOTICE_VERSION;
    if (!consent) {
      consent = await tx.pgFaceConsent.create({
        data: {
          rsvpId, userId, eventId: event.id, organisationId: event.organisationId,
          ageAttestation: "ADULT", ageAttestedAt: now, noticeVersion: FACE_NOTICE_VERSION, grantedAt: now,
        },
      });
    } else if (needsGrant) {
      // The registration moved to another account: the previous person's consent ends first (PG purges their selfie).
      if (consent.userId !== userId) await withdrawConsentTx(tx, consent, now, true);
      const fresh = consent.userId !== userId || Boolean(consent.withdrawnAt);
      consent = await tx.pgFaceConsent.update({
        where: { id: consent.id },
        data: {
          userId, ageAttestation: "ADULT", ageAttestedAt: now, noticeVersion: FACE_NOTICE_VERSION, grantedAt: now, withdrawnAt: null,
          ...(fresh ? { selfieState: "NONE", enrollmentId: null, rejectedReason: null } : {}),
        },
      });
    }
    if (needsGrant) {
      await capturePgEventTx(tx, {
        type: "consent.granted", organisationId: event.organisationId, kind: "consent", resourceId: rsvpId, eventId: event.id,
        key: `consent:${rsvpId}`,
        snapshot: { rsvpId, userId, noticeVersion: FACE_NOTICE_VERSION, grantedAt: now.toISOString() },
      });
      await recordAuditEvent({
        client: tx, action: "PG_FACE_CONSENT_GRANTED", actorUserId: userId, organisationId: event.organisationId,
        targetType: "RSVP", targetId: rsvpId, metadata: { noticeVersion: FACE_NOTICE_VERSION },
      });
    }

    const action = consent.selfieState === "ADDED" && consent.enrollmentId ? "replace" : "add";
    const minted = mintEnrollmentTicket({
      secret, issuer: oidcIssuer(), subject, organisationId: event.organisationId, eventId: event.id, registrationId: rsvpId,
      noticeVersion: FACE_NOTICE_VERSION, action, now,
    });
    await tx.pgSelfieTicket.create({
      data: { jti: minted.claims.jti, consentId: consent.id, userId, issuedAt: now, expiresAt: minted.expiresAt },
    });
    if (action === "add") {
      await tx.pgFaceConsent.update({ where: { id: consent.id }, data: { selfieState: "PENDING", rejectedReason: null } });
    }
    return {
      ok: true,
      ticket: minted.ticket,
      uploadUrl: new URL(ENROLLMENT_PATH, `${integration.publicUrl.replace(/\/+$/, "")}/`).toString(),
      expiresAt: minted.expiresAt.toISOString(),
      noticeVersion: FACE_NOTICE_VERSION,
      action,
    };
  });
}

export { TICKET_TTL_SECONDS };

/** "Stop face matching" for one registration. */
export async function withdrawFaceMatching(userId: string, rsvpId: string): Promise<{ ok: boolean }> {
  if (!rsvpId || rsvpId.length > 128) return { ok: false };
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const consent = await tx.pgFaceConsent.findFirst({ where: { rsvpId, userId } });
    if (!consent) return { ok: false };
    const { changed } = await withdrawConsentTx(tx, consent, now, true);
    if (changed) {
      await recordAuditEvent({
        client: tx, action: "PG_FACE_CONSENT_WITHDRAWN", actorUserId: userId, organisationId: consent.organisationId,
        targetType: "RSVP", targetId: rsvpId, metadata: { scope: "event", via: "yuyu" },
      });
    }
    return { ok: true };
  });
}

/** Account → Privacy "Stop face matching everywhere": one consent.withdrawn with scope "all". */
export async function withdrawAllFaceMatching(userId: string, via: "yuyu" | "pg" = "yuyu") {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const consents = await tx.pgFaceConsent.findMany({ where: { userId, grantedAt: { not: null }, withdrawnAt: null } });
    const revokedJtis: string[] = [];
    for (const consent of consents) revokedJtis.push(...(await withdrawConsentTx(tx, consent, now, false)).revokedJtis);
    // Sent even when nothing is active here, so PG purges anything it still holds.
    await capturePgEventTx(tx, {
      type: "consent.withdrawn", organisationId: null, kind: "consent", resourceId: userId, eventId: null,
      key: `consent:user:${userId}`,
      snapshot: { rsvpId: null, userId, scope: "all", withdrawnAt: now.toISOString(), revokedJtis: revokedJtis.slice(0, PG_MAX_REVOKED_JTIS) },
    });
    await recordAuditEvent({
      client: tx, action: "PG_FACE_CONSENT_WITHDRAWN", actorUserId: userId, targetType: "User", targetId: userId,
      metadata: { scope: "all", count: consents.length, via },
    });
    return { withdrawn: consents.length };
  });
}

// ── People's Gallery callbacks (integration API) ─────────────────────────

export type CallbackResult = { status: 200; selfieState: PgSelfieState } | { status: 404 } | { status: 409 };

async function consentForSubject(tx: Tx, registrationId: string, subject: string, subjectOf: (userId: string) => string) {
  const consent = await tx.pgFaceConsent.findUnique({
    where: { rsvpId: registrationId },
    include: { rsvp: { select: { userId: true } } },
  });
  if (!consent || consent.rsvp.userId !== consent.userId || subjectOf(consent.userId) !== subject) return null;
  const shared = await tx.$queryRaw<{ on: boolean }[]>`SELECT "pg_integration_org_enabled"(${consent.organisationId}::text) AS "on"`;
  return shared[0]?.on ? consent : null;
}

/** POST /enrollments/status: PG reports the outcome of an upload or a removal. */
export async function applyEnrollmentStatus(body: PgEnrollmentStatus, subjectOf: (userId: string) => string, now = new Date()): Promise<CallbackResult> {
  return prisma.$transaction(async (tx): Promise<CallbackResult> => {
    await tx.$queryRaw`SELECT "id" FROM "RSVP" WHERE "id" = ${body.registrationId} FOR UPDATE`;
    const consent = await consentForSubject(tx, body.registrationId, body.subject, subjectOf);
    if (!consent) return { status: 404 };

    if (body.state === "removed") {
      if (consent.enrollmentId === body.enrollmentId) {
        await tx.pgFaceConsent.update({ where: { id: consent.id }, data: { selfieState: "REMOVED", enrollmentId: null, selfieUpdatedAt: now } });
        await selfieCapture(tx, "selfie.removed", consent, body.enrollmentId);
        return { status: 200, selfieState: "REMOVED" };
      }
      return { status: 200, selfieState: consent.selfieState as PgSelfieState };
    }

    const ticket = await tx.pgSelfieTicket.findUnique({ where: { jti: body.jti } });
    if (!ticket || ticket.consentId !== consent.id || ticket.issuedAt.getTime() < now.getTime() - CALLBACK_GRACE_MS) return { status: 404 };
    if (ticket.enrollmentId) {
      // Single use: the same report again is a harmless replay; another enrollment is refused.
      return ticket.enrollmentId === body.enrollmentId ? { status: 200, selfieState: consent.selfieState as PgSelfieState } : { status: 409 };
    }
    await tx.pgSelfieTicket.update({ where: { jti: ticket.jti }, data: { usedAt: ticket.usedAt ?? now, enrollmentId: body.enrollmentId } });

    // The person stopped face matching after this ticket was issued: tell PG to drop it.
    if (!consent.grantedAt || consent.withdrawnAt || consent.ageAttestation !== "ADULT" || ticket.usedAt) {
      if (body.state === "added") await selfieCapture(tx, "selfie.removed", consent, body.enrollmentId);
      return { status: 200, selfieState: consent.selfieState as PgSelfieState };
    }

    if (body.state === "rejected") {
      // A rejected retake leaves an existing selfie in place.
      if (consent.selfieState === "ADDED") return { status: 200, selfieState: "ADDED" };
      await tx.pgFaceConsent.update({ where: { id: consent.id }, data: { selfieState: "REJECTED", rejectedReason: body.reason, selfieUpdatedAt: now } });
      return { status: 200, selfieState: "REJECTED" };
    }

    if (consent.enrollmentId && consent.enrollmentId !== body.enrollmentId) {
      await selfieCapture(tx, "selfie.removed", consent, consent.enrollmentId);
    }
    await tx.pgFaceConsent.update({
      where: { id: consent.id },
      data: { selfieState: "ADDED", enrollmentId: body.enrollmentId, rejectedReason: null, selfieUpdatedAt: now },
    });
    await selfieCapture(tx, "selfie.added", consent, body.enrollmentId);
    return { status: 200, selfieState: "ADDED" };
  });
}

/** POST /consents/withdraw: the attendee withdrew inside People's Gallery. */
export async function applyPgWithdrawal(
  body: { subject: string; scope: "event" | "all"; registrationId?: string | null },
  integration: LoadedIntegration,
  subjectOf: (userId: string) => string,
): Promise<{ status: 200; withdrawn: number } | { status: 404 }> {
  if (body.scope === "event" && body.registrationId) {
    const registrationId = body.registrationId;
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const consent = await consentForSubject(tx, registrationId, body.subject, subjectOf);
      if (!consent) return { status: 404 as const };
      const { changed } = await withdrawConsentTx(tx, consent, now, true);
      if (changed) {
        await recordAuditEvent({
          client: tx, action: "PG_FACE_CONSENT_WITHDRAWN", organisationId: consent.organisationId, targetType: "RSVP", targetId: registrationId,
          metadata: { scope: "event", via: "pg" },
        });
      }
      return { status: 200 as const, withdrawn: changed ? 1 : 0 };
    });
  }
  // The subject → user lookup needs the person's grant to PG (they withdrew while signed in there).
  const grant = await prisma.oAuthGrant.findFirst({
    where: { clientId: integration.oauthClient.id, subject: body.subject },
    select: { userId: true },
  });
  if (!grant || subjectOf(grant.userId) !== body.subject) return { status: 404 };
  const { withdrawn } = await withdrawAllFaceMatching(grant.userId, "pg");
  return { status: 200, withdrawn };
}
