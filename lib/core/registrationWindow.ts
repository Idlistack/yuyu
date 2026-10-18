import "server-only";

import { EventStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/org";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { canPublishEvents, getMembership } from "@/lib/permissions";
import { isRegistrationClosed, registrationClosesAt } from "@/lib/registrationCutoff";

/*
 * Close or reopen sign-ups for a standalone event. This changes only the
 * registration cutoff that the dashboard event form edits, with the same
 * permission (organisation OWNER/ADMIN), rate limit and revalidation.
 */

export const registrationWindowSchema = z.object({
  organisationSlug: z.string().trim().min(1).max(120),
  eventId: z.string().trim().min(1).max(128),
  open: z.boolean(),
}).strict();

export type RegistrationWindowState = { registrationOpen: boolean; registrationClosesAt: string | null };

export function registrationWindowState(event: {
  status: EventStatus;
  startDateTime: Date;
  endDateTime: Date;
  registrationClosesAt: Date | null;
  registrationLeadMinutes: number | null;
}, now = new Date()): RegistrationWindowState {
  return {
    registrationOpen: event.status === EventStatus.PUBLISHED && event.endDateTime > now && !isRegistrationClosed(event, now),
    registrationClosesAt: registrationClosesAt(event)?.toISOString() ?? null,
  };
}

export async function setRegistrationWindowForUser(
  actorUserId: string | null,
  input: unknown,
): Promise<ActionResult<RegistrationWindowState>> {
  if (!actorUserId) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("action", actorUserId)) return { ok: false, error: "Too many updates. Please try again later." };
  const parsed = registrationWindowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid registration update." };

  const org = await prisma.organisation.findUnique({ where: { slug: parsed.data.organisationSlug }, select: { id: true, slug: true } });
  if (!org) return { ok: false, error: "Organisation not found." };
  const membership = await getMembership(actorUserId, org.id);
  if (!canPublishEvents(membership)) return { ok: false, error: "You do not have permission to edit events." };
  const event = await prisma.event.findFirst({ where: { id: parsed.data.eventId, organisationId: org.id }, select: { id: true, slug: true } });
  if (!event) return { ok: false, error: "Event not found." };

  const now = new Date();
  // Closing pins the cutoff to now; reopening clears every cutoff (the
  // database allows only one of the two cutoff modes at a time).
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: parsed.data.open
      ? { registrationClosesAt: null, registrationLeadMinutes: null }
      : { registrationClosesAt: now, registrationLeadMinutes: null },
    select: { status: true, startDateTime: true, endDateTime: true, registrationClosesAt: true, registrationLeadMinutes: true },
  });

  await recordAuditEvent({
    action: parsed.data.open ? "EVENT_REGISTRATION_REOPENED" : "EVENT_REGISTRATION_CLOSED",
    actorUserId,
    organisationId: org.id,
    targetType: "Event",
    targetId: event.id,
  });
  revalidatePath(`/${org.slug}`);
  revalidatePath(`/${org.slug}/${event.slug}`);
  revalidatePath(`/dashboard/${org.slug}`);
  revalidatePath(`/dashboard/${org.slug}/event/${event.id}`);
  return { ok: true, data: registrationWindowState(updated, now) };
}
