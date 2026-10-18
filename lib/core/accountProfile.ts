import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/actions/org";
import { flattenZodErrors } from "@/app/actions/utils";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { isUploadedImageUrl, isUserUploadUrl } from "@/lib/uploadUrl";

/* Profile updates shared by the account page and the mobile API. */

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be at most 120 characters"),
  profileImageUrl: z
    .string()
    .trim()
    .max(2048, "Profile image URL must be at most 2048 characters")
    .refine(isUploadedImageUrl, "Choose an uploaded profile image")
    .or(z.literal("")),
});

export async function updateAccountProfileForUser(
  userId: string,
  input: unknown,
): Promise<ActionResult<{ name: string; profileImageUrl: string | null }>> {
  if (await isActionRateLimited("action", userId)) {
    return { ok: false, error: "Too many updates. Please try again later." };
  }

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const { name, profileImageUrl } = parsed.data;
  const savedProfileImageUrl = profileImageUrl || null;
  if (
    savedProfileImageUrl &&
    !isUserUploadUrl(savedProfileImageUrl, userId)
  ) {
    return { ok: false, error: "Choose your uploaded profile image." };
  }
  await prisma.user.update({
    where: { id: userId },
    data: { name, profileImageUrl: savedProfileImageUrl },
  });
  await recordAuditEvent({
    action: "ACCOUNT_PROFILE_UPDATED",
    actorUserId: userId,
    targetType: "User",
    targetId: userId,
  });
  revalidatePath("/account");

  return { ok: true, data: { name, profileImageUrl: savedProfileImageUrl } };
}
