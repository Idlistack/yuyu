import "server-only";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/org";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { certificateImagesAreOwned } from "@/lib/certificateAssets";
import { certificateTemplateInputSchema } from "@/lib/certificateTemplate";
import { prisma } from "@/lib/db";
import { getMembership, hasRoleAtLeast } from "@/lib/permissions";

/*
 * Feedback form settings shared by the dashboard Server Action and the mobile
 * API. Managing feedback is an organisation OWNER/ADMIN operation.
 */

export const feedbackSettingsSchema = z.object({
  organisationSlug: z.string().trim().min(1).max(120),
  eventId: z.string().trim().min(1).max(128),
  isOpen: z.boolean(),
  title: z.string().trim().min(1).max(120),
  thankYouMessage: z.string().trim().min(1).max(500),
  certificateEnabled: z.boolean(),
  certificateTemplate: certificateTemplateInputSchema.nullable().optional(),
}).strict();

const feedbackPath = (orgSlug: string, eventSlug: string) => `/${orgSlug}/${eventSlug}/feedback`;

/** Non-redirecting equivalent of `requireOrgRole(slug, "ADMIN")` plus the feedback rate limit. */
export async function feedbackAccessForUser(userId: string | null, input: { organisationSlug: string; eventId: string }) {
  if (!userId) return { error: "You must be signed in." } as const;
  const organisation = await prisma.organisation.findUnique({ where: { slug: input.organisationSlug }, select: { id: true, slug: true, name: true } });
  if (!organisation) return null;
  const membership = await getMembership(userId, organisation.id);
  if (!membership || !hasRoleAtLeast(membership.role, "ADMIN")) return { error: "You do not have permission to manage feedback." } as const;
  if (await isActionRateLimited("feedback", userId)) return { error: "Too many feedback form changes. Try again shortly." } as const;
  const event = await prisma.event.findFirst({ where: { id: input.eventId, organisationId: organisation.id }, select: { id: true, slug: true } });
  return event ? { organisation, userId, event } : null;
}

type FeedbackAccess = (input: { organisationSlug: string; eventId: string }) => Promise<
  | { organisation: { id: string; slug: string }; userId: string; event: { id: string; slug: string } }
  | { error: string }
  | null
>;

/**
 * Save feedback settings after `access` has resolved the caller. The dashboard
 * passes its redirecting `requireOrgRole` check; the mobile API passes
 * `feedbackAccessForUser`. Everything after access is one shared code path.
 */
export async function saveFeedbackSettingsWithAccess(access: FeedbackAccess, input: unknown): Promise<ActionResult<{ formId: string }>> {
  const parsed = feedbackSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the feedback settings." };
  const context = await access(parsed.data);
  if (!context || "error" in context) return { ok: false, error: context?.error ?? "Event not found." };
  if (parsed.data.certificateTemplate && !await certificateImagesAreOwned(parsed.data.certificateTemplate, context.organisation.id)) {
    return { ok: false, error: "Choose certificate images uploaded by this organisation." };
  }
  const certificateData = parsed.data.certificateTemplate === undefined ? {} : { certificateTemplate: parsed.data.certificateTemplate ?? Prisma.DbNull };
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.eventFeedbackForm.findUnique({ where: { eventId: context.event.id }, select: { id: true } });
    if (existing) await tx.$queryRaw`SELECT "id" FROM "EventFeedbackForm" WHERE "id" = ${existing.id} FOR UPDATE`;
    if (parsed.data.isOpen) {
      if (!existing) return { error: "Add at least one feedback question before opening the form." } as const;
      const fieldCount = await tx.eventFeedbackField.count({ where: { formId: existing.id } });
      if (fieldCount === 0) return { error: "Add at least one feedback question before opening the form." } as const;
    }
    const saved = await tx.eventFeedbackForm.upsert({ where: { eventId: context.event.id }, create: { eventId: context.event.id, isOpen: parsed.data.isOpen, title: parsed.data.title, thankYouMessage: parsed.data.thankYouMessage, certificateEnabled: parsed.data.certificateEnabled, ...certificateData }, update: { isOpen: parsed.data.isOpen, title: parsed.data.title, thankYouMessage: parsed.data.thankYouMessage, certificateEnabled: parsed.data.certificateEnabled, ...certificateData } });
    await recordAuditEvent({ action: "FEEDBACK_FORM_UPDATED", actorUserId: context.userId, organisationId: context.organisation.id, targetType: "EventFeedbackForm", targetId: saved.id, metadata: { eventId: context.event.id, isOpen: saved.isOpen, certificateEnabled: saved.certificateEnabled }, client: tx });
    return { form: saved } as const;
  });
  if ("error" in result && typeof result.error === "string") return { ok: false, error: result.error };
  revalidatePath(feedbackPath(context.organisation.slug, context.event.slug));
  return { ok: true, data: { formId: result.form.id } };
}

export function saveFeedbackSettingsForUser(actorUserId: string | null, input: unknown) {
  return saveFeedbackSettingsWithAccess((target) => feedbackAccessForUser(actorUserId, target), input);
}
