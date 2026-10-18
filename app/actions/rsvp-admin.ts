"use server";

import type { RsvpStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import type { ActionResult } from "./org";
import { addManualRsvpForUser, deleteRsvpForUser, restoreRsvpForUser, updateRsvpRegistrationForUser } from "@/lib/core/rsvpAdmin";

/*
 * Thin Server Action wrappers. Organiser RSVP administration lives in
 * lib/core/rsvpAdmin.ts and is shared with the mobile API.
 */

async function currentUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function addManualRsvp(input: unknown): Promise<ActionResult<{ count: number; status: RsvpStatus }>> {
  const result = await addManualRsvpForUser(await currentUserId(), input);
  if (!result.ok || !result.data) return result.ok ? { ok: true } : result;
  return { ok: true, data: { count: result.data.count, status: result.data.status } };
}

export async function updateRsvpRegistration(input: unknown): Promise<ActionResult> {
  return updateRsvpRegistrationForUser(await currentUserId(), input);
}

export async function deleteRsvp(input: unknown): Promise<ActionResult<{ undoId: string }>> {
  return deleteRsvpForUser(await currentUserId(), input);
}

/** Restore only a short-lived snapshot created by this server for this organiser. */
export async function restoreRsvp(input: unknown): Promise<ActionResult> {
  return restoreRsvpForUser(await currentUserId(), input);
}
