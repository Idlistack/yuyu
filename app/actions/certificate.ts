"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgRole } from "@/lib/permissions";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { uploadFile } from "@/lib/storage";
import { recordAuditEvent } from "@/lib/audit";
import { certificateTemplateSchema } from "@/lib/certificateTemplate";
import { renderCustomCertificate } from "@/lib/renderCertificate";
import type { ActionResult } from "./org";

const scope = z.object({ organisationSlug: z.string().trim().min(1).max(120), eventId: z.string().min(1).max(128) });
async function access(input: z.infer<typeof scope>) {
  const context = await requireOrgRole(input.organisationSlug, "ADMIN");
  if (await isActionRateLimited("upload", context.userId)) return null;
  const event = await prisma.event.findFirst({ where: { id: input.eventId, organisationId: context.organisation.id }, select: { id: true } });
  return event ? context : null;
}

export async function uploadCertificateBackground(data: FormData): Promise<ActionResult<{ key: string }>> {
  const parsed = scope.safeParse({ organisationSlug: data.get("organisationSlug"), eventId: data.get("eventId") });
  if (!parsed.success) return { ok: false, error: "Invalid event." };
  const context = await access(parsed.data);
  if (!context) return { ok: false, error: "Upload unavailable. Check access or try again shortly." };
  const file = data.get("file");
  if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return { ok: false, error: "Choose a JPEG, PNG, or WebP up to 5 MB." };
  const image = await createSafeWebpDerivative(file, { width: 6000, height: 6000, fit: "inside", lossless: true });
  if ("error" in image) return { ok: false, error: image.error };
  try {
    const key = `organisations/${context.organisation.id}/certificate-backgrounds/${crypto.randomUUID()}.webp`;
    await uploadFile({ key, body: image.body, contentType: "image/webp", organisationId: context.organisation.id });
    await recordAuditEvent({ action: "CERTIFICATE_BACKGROUND_UPLOADED", actorUserId: context.userId, organisationId: context.organisation.id, targetType: "Event", targetId: parsed.data.eventId });
    return { ok: true, data: { key } };
  } catch {
    return { ok: false, error: "Could not upload the certificate background." };
  }
}

export async function previewCertificate(input: unknown): Promise<ActionResult<{ image: string }>> {
  const parsed = scope.extend({ template: certificateTemplateSchema, name: z.string().trim().min(1).max(200) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the name area and preview name." };
  const context = await access(parsed.data);
  if (!context) return { ok: false, error: "Preview unavailable. Check access or try again shortly." };
  const key = parsed.data.template.backgroundKey;
  if (!key.startsWith(`organisations/${context.organisation.id}/certificate-backgrounds/`) || !await prisma.asset.findFirst({ where: { key, organisationId: context.organisation.id }, select: { id: true } })) return { ok: false, error: "Invalid certificate background." };
  try {
    const jpeg = await renderCustomCertificate(parsed.data.template, parsed.data.name, context.organisation.id);
    return { ok: true, data: { image: `data:image/jpeg;base64,${jpeg.toString("base64")}` } };
  } catch {
    return { ok: false, error: "Could not render the certificate. Check the image and server fonts." };
  }
}
