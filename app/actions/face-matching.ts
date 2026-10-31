"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/permissions";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import type { ActionResult } from "./org";
import {
  issueSelfieTicket,
  recordUnder18Attestation,
  withdrawAllFaceMatching,
  withdrawFaceMatching,
  type SelfieActionError,
} from "@/lib/pgIntegration/selfie";
import { selfieTicketInputSchema } from "@/lib/pgIntegration/selfieInput";

/*
 * Face matching with People's Gallery (docs/PG_INTEGRATION.md#selfie-step).
 * Every action acts only on the signed-in person's own registrations; the
 * selfie itself never reaches these actions (the browser uploads it straight
 * to People's Gallery with the ticket).
 */

const rsvpIdSchema = z.object({ rsvpId: z.string().min(1).max(128) }).strict();

const SELFIE_ERROR_MESSAGES: Record<SelfieActionError, string> = {
  not_found: "We couldn't find that registration on your account.",
  not_enabled: "Photos by People's Gallery isn't available for this event.",
  not_confirmed: "Face matching opens once your registration is confirmed.",
  series: "Face matching isn't available for series events yet.",
  event_over: "Photos for this event are no longer kept.",
  minor: "Face matching is only for people aged 18 or older.",
  consent_required: "Please read the notice and agree to it before adding a selfie.",
  rate_limited: "You've asked for several uploads in the last hour. Please try again later.",
};

export async function requestSelfieUpload(input: unknown): Promise<ActionResult<{ ticket: string; uploadUrl: string; expiresAt: string; action: "add" | "replace" }>> {
  const session = await requireAuth();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Please try again later." };
  const parsed = selfieTicketInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: SELFIE_ERROR_MESSAGES.consent_required };
  const result = await issueSelfieTicket(session.user.id, parsed.data.rsvpId, { noticeVersion: parsed.data.noticeVersion });
  if (!result.ok) return { ok: false, error: SELFIE_ERROR_MESSAGES[result.error] };
  return { ok: true, data: { ticket: result.ticket, uploadUrl: result.uploadUrl, expiresAt: result.expiresAt, action: result.action } };
}

export async function attestUnder18(input: unknown): Promise<ActionResult> {
  const session = await requireAuth();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Please try again later." };
  const parsed = rsvpIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: SELFIE_ERROR_MESSAGES.not_found };
  const result = await recordUnder18Attestation(session.user.id, parsed.data.rsvpId);
  if (!result.ok) return { ok: false, error: SELFIE_ERROR_MESSAGES[result.error] };
  return { ok: true };
}

export async function stopFaceMatching(input: unknown): Promise<ActionResult> {
  const session = await requireAuth();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Please try again later." };
  const parsed = rsvpIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: SELFIE_ERROR_MESSAGES.not_found };
  const result = await withdrawFaceMatching(session.user.id, parsed.data.rsvpId);
  if (!result.ok) return { ok: false, error: SELFIE_ERROR_MESSAGES.not_found };
  revalidatePath("/account/privacy");
  return { ok: true };
}

export async function stopAllFaceMatching(): Promise<ActionResult<{ withdrawn: number }>> {
  const session = await requireAuth();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Please try again later." };
  const { withdrawn } = await withdrawAllFaceMatching(session.user.id);
  revalidatePath("/account/privacy");
  return { ok: true, data: { withdrawn } };
}

const preferenceSchema = z.object({ pgPhotosEmail: z.boolean() }).strict();

export async function updatePhotoEmailPreference(input: unknown): Promise<ActionResult> {
  const session = await requireAuth();
  if (await isActionRateLimited("action", session.user.id)) return { ok: false, error: "Too many requests. Please try again later." };
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const userId = session.user.id;
  await prisma.$transaction(async (tx) => {
    await tx.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, pgPhotosEmail: parsed.data.pgPhotosEmail },
      update: { pgPhotosEmail: parsed.data.pgPhotosEmail },
    });
    await recordAuditEvent({
      client: tx, action: "NOTIFICATION_PREFERENCE_UPDATED", actorUserId: userId, targetType: "User", targetId: userId,
      metadata: { pgPhotosEmail: parsed.data.pgPhotosEmail },
    });
  });
  revalidatePath("/account/privacy");
  return { ok: true };
}
