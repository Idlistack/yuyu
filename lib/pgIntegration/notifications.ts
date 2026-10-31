import "server-only";

import crypto from "node:crypto";
import { Prisma, RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canonicalJson, type LoadedIntegration } from "@/lib/pgIntegration/delivery";
import {
  pgNotificationResponseSchema,
  type PgNotificationKind,
  type PgNotificationRequest,
  type PgNotificationResponse,
  type PgNotificationSkipReason,
} from "@/lib/pgIntegration/contract";

/*
 * PG → Yuyu attendee notifications (plan §5.7, decision D-Mail,
 * docs/PG_INTEGRATION.md#attendee-notifications). People's Gallery holds no
 * attendee email addresses: it names registrations by id and pairwise
 * subject, and Yuyu emails the people (as "Yuyu, on behalf of People's
 * Gallery") through the existing outbox. Each Idempotency-Key is honoured
 * for 7 days: a replay returns the stored answer and sends nothing.
 */

export const NOTIFICATION_RECEIPT_DAYS = 7;
export const PG_PHOTOS_OUTBOX_KIND = "pg-photos";

/** Outbox payload: ids and counts only; the address and preference are read at send time. */
export type PgPhotosPayload = {
  userId: string;
  rsvpId: string;
  eventId: string;
  kind: PgNotificationKind;
  photosOfYou: number;
  newSinceLast: number;
  link: string;
};

export function requestHash(body: PgNotificationRequest) {
  return crypto.createHash("sha256").update(canonicalJson(body)).digest("hex");
}

/**
 * The deep link must point at People's Gallery's public origin (the one the
 * operator configured), so a compromised or buggy caller cannot make Yuyu
 * email a link to another site.
 */
export function allowedDeepLink(link: string, publicUrl: string | null, allowInternalTarget: boolean) {
  if (!publicUrl) return false;
  let url: URL;
  let base: URL;
  try {
    url = new URL(link);
    base = new URL(publicUrl);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol !== "https:" && !(allowInternalTarget && url.protocol === "http:")) return false;
  return url.origin === base.origin;
}

export type NotificationOutcome =
  | { status: 202; body: PgNotificationResponse; replayed: boolean }
  | { status: 404 }
  | { status: 409 }
  | { status: 400 };

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function acceptPgNotification(params: {
  idempotencyKey: string;
  body: PgNotificationRequest;
  integration: LoadedIntegration;
  subjectOf: (userId: string) => string;
}): Promise<NotificationOutcome> {
  const { idempotencyKey, body, subjectOf } = params;
  const hash = requestHash(body);

  const replay = async (): Promise<NotificationOutcome | null> => {
    const receipt = await prisma.pgNotificationReceipt.findUnique({ where: { idempotencyKey } });
    if (!receipt) return null;
    if (receipt.requestHash !== hash) return { status: 409 };
    return { status: 202, body: pgNotificationResponseSchema.parse(receipt.response), replayed: true };
  };
  const earlier = await replay();
  if (earlier) return earlier;

  const settings = await prisma.pgIntegration.findUnique({ where: { id: params.integration.id }, select: { publicUrl: true, allowInternalTarget: true } });
  if (!allowedDeepLink(body.link, settings?.publicUrl ?? null, settings?.allowInternalTarget ?? false)) return { status: 400 };

  // Tenant check: the event must belong to an organisation shared with PG.
  const event = await prisma.event.findUnique({ where: { id: body.eventId }, select: { id: true, organisationId: true } });
  const shared = event ? await prisma.pgIntegrationOrganisation.findUnique({ where: { organisationId: event.organisationId }, select: { organisationId: true } }) : null;
  if (!event || !shared) return { status: 404 };

  const ids = [...new Set(body.recipients.map((recipient) => recipient.registrationId))];
  const rsvps = await prisma.rSVP.findMany({
    where: { id: { in: ids }, eventId: event.id },
    select: {
      id: true, userId: true, status: true,
      user: { select: { email: true, notificationPreference: { select: { pgPhotosEmail: true } } } },
      pgFaceConsent: { select: { userId: true, grantedAt: true, withdrawnAt: true } },
    },
  });
  const byId = new Map(rsvps.map((rsvp) => [rsvp.id, rsvp]));

  const skipped: { registrationId: string; reason: PgNotificationSkipReason }[] = [];
  const queue: PgPhotosPayload[] = [];
  const seen = new Set<string>();
  for (const recipient of body.recipients) {
    const skip = (reason: PgNotificationSkipReason) => skipped.push({ registrationId: recipient.registrationId, reason });
    if (seen.has(recipient.registrationId)) { skip("duplicate"); continue; }
    seen.add(recipient.registrationId);
    const rsvp = byId.get(recipient.registrationId);
    // Unknown, another event's, a guest's, or another person's registration all look the same.
    if (!rsvp?.userId || subjectOf(rsvp.userId) !== recipient.subject) { skip("not_found"); continue; }
    if (rsvp.status !== RsvpStatus.CONFIRMED) { skip("not_confirmed"); continue; }
    const consent = rsvp.pgFaceConsent;
    if (!consent || consent.userId !== rsvp.userId || !consent.grantedAt || consent.withdrawnAt) { skip("withdrawn"); continue; }
    if (rsvp.user?.notificationPreference?.pgPhotosEmail === false) { skip("unsubscribed"); continue; }
    if (!rsvp.user?.email) { skip("no_email"); continue; }
    queue.push({
      userId: rsvp.userId, rsvpId: rsvp.id, eventId: event.id, kind: body.kind,
      photosOfYou: recipient.counts.photosOfYou, newSinceLast: recipient.counts.newSinceLast, link: body.link,
    });
  }
  const response = pgNotificationResponseSchema.parse({ data: { accepted: queue.length, skipped } });

  try {
    await prisma.$transaction(async (tx) => {
      // The receipt and the emails commit together: a replay can never send twice.
      await tx.pgNotificationReceipt.create({
        data: { idempotencyKey, requestHash: hash, kind: body.kind, eventId: event.id, accepted: queue.length, response: response as Prisma.InputJsonValue },
      });
      if (queue.length > 0) {
        await tx.outboxMessage.createMany({ data: queue.map((payload) => ({ kind: PG_PHOTOS_OUTBOX_KIND, payload: payload as Prisma.InputJsonValue })) });
      }
      await tx.auditEvent.create({
        data: {
          action: "PG_NOTIFICATION_ACCEPTED", organisationId: event.organisationId, targetType: "Event", targetId: event.id,
          metadata: { kind: body.kind, accepted: queue.length, skipped: skipped.length },
        },
      });
    });
  } catch (error) {
    // A concurrent request with the same key won the insert.
    if (isUniqueViolation(error)) return (await replay()) ?? { status: 409 };
    throw error;
  }
  return { status: 202, body: response, replayed: false };
}

// ── Email content ────────────────────────────────────────────────────────

function photoWord(count: number) {
  return count === 1 ? "photo" : "photos";
}

export function pgPhotosSubject(kind: PgNotificationKind, eventTitle: string, photosOfYou: number, newSinceLast: number) {
  const title = eventTitle.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 160);
  if (kind === "photos_ready") {
    return `Your ${photosOfYou} ${photoWord(photosOfYou)} from ${title} ${photosOfYou === 1 ? "is" : "are"} ready`;
  }
  const count = newSinceLast > 0 ? newSinceLast : photosOfYou;
  return `${count} new ${photoWord(count)} of you from ${title}`;
}

/**
 * The push version (ATT-09). Yuyu has no push channel yet, so nothing sends
 * it today; the Yuyu app will use exactly this text and deep link once
 * device registration exists, under the same preference as the email.
 */
export function pgPhotosPush(kind: PgNotificationKind, eventTitle: string, photosOfYou: number, newSinceLast: number, link: string) {
  return {
    title: pgPhotosSubject(kind, eventTitle, photosOfYou, newSinceLast),
    body: "Matched with your selfie by People's Gallery. Tap to see them.",
    link,
  };
}
