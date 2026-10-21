"use server";

import { auth } from "@/lib/auth";
import type { ActionResult } from "./org";
import {
  countBroadcastRecipientsForUser,
  previewEventBroadcastForUser,
  sendEventBroadcastForUser,
  sendEventBroadcastTestForUser,
} from "@/lib/core/broadcasts";

/*
 * Thin Server Action wrappers. Broadcast rules (organisation-admin only,
 * sanitising, rate limits, outbox queueing and audit) live in
 * lib/core/broadcasts.ts and are shared with the mobile API.
 */

async function currentUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function countBroadcastRecipients(input: unknown): Promise<ActionResult<{ count: number }>> {
  return countBroadcastRecipientsForUser(await currentUserId(), input);
}

/** The exact email a recipient would receive, rendered with example values for the dashboard preview. */
export async function previewEventBroadcast(input: unknown): Promise<ActionResult<{ subject: string; html: string; text: string }>> {
  return previewEventBroadcastForUser(await currentUserId(), input);
}

export async function sendEventBroadcast(input: unknown): Promise<ActionResult<{ recipientCount: number; broadcastId: string }>> {
  return sendEventBroadcastForUser(await currentUserId(), input);
}

export async function sendEventBroadcastTest(input: unknown): Promise<ActionResult<{ to: string }>> {
  return sendEventBroadcastTestForUser(await currentUserId(), input);
}
