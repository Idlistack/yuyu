import "server-only";

import { EventPermission } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/org";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { canAccessEvent } from "@/lib/eventAccess";

/*
 * Shared access check for event website/programme mutations, plus the live
 * programme delay used by both the dashboard and the mobile API.
 */

export const eventWebsiteTarget = z.object({
  organisationSlug: z.string().min(1),
  eventId: z.string().min(1),
});

export async function eventWebsiteContextForUser(
  userId: string | null,
  input: z.infer<typeof eventWebsiteTarget>,
  permission: EventPermission,
) {
  if (!userId) return null;
  const session = { user: { id: userId } };
  if (await isActionRateLimited("action", session.user.id)) return null;
  const org = await prisma.organisation.findUnique({
    where: { slug: input.organisationSlug },
  });
  if (
    !org ||
    !(await canAccessEvent({
      userId: session.user.id,
      organisationId: org.id,
      eventId: input.eventId,
      permission,
    }))
  )
    return null;
  const event = await prisma.event.findFirst({
    where: { id: input.eventId, organisationId: org.id },
    select: { id: true, slug: true },
  });
  return event ? { session, org, event } : null;
}

export function revalidateEventWebsitePaths(orgSlug: string, event: { id: string; slug: string }) {
  revalidatePath(`/${orgSlug}/${event.slug}`);
  revalidatePath(`/${orgSlug}/${event.slug}/schedule`);
  revalidatePath(`/dashboard/${orgSlug}/event/${event.id}`);
  revalidatePath(`/dashboard/${orgSlug}/event/${event.id}/schedule`);
}

function fail(message: string): ActionResult {
  return { ok: false, error: message };
}

export async function setEventSessionDelayForUser(
  actorUserId: string | null,
  input: unknown,
): Promise<ActionResult> {
  const parsed = eventWebsiteTarget
    .extend({
      sessionId: z.string().min(1),
      delayMinutes: z.number().int().min(0).max(1440),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Invalid programme delay.");
  const c = await eventWebsiteContextForUser(actorUserId, parsed.data, EventPermission.PUBLISH_AND_SCHEDULE);
  if (!c) return fail("You do not have permission to manage the programme.");
  const result = await prisma.eventSession.updateMany({
    where: { id: parsed.data.sessionId, eventId: c.event.id },
    data: { delayMinutes: parsed.data.delayMinutes },
  });
  if (!result.count) return fail("Session not found.");
  const session = await prisma.eventSession.findFirst({
    where: { id: parsed.data.sessionId, eventId: c.event.id },
    select: { slug: true },
  });
  await recordAuditEvent({
    action: "EVENT_SESSION_DELAY_SET",
    actorUserId: c.session.user.id,
    organisationId: c.org.id,
    targetType: "EventSession",
    targetId: parsed.data.sessionId,
    metadata: { delayMinutes: parsed.data.delayMinutes },
  });
  revalidateEventWebsitePaths(c.org.slug, c.event);
  if (session)
    revalidatePath(`/${c.org.slug}/${c.event.slug}/sessions/${session.slug}`);
  return { ok: true };
}
