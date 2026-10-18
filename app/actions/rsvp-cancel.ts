"use server";

import { auth } from "@/lib/auth";
import type { ActionResult } from "./org";
import { cancelRsvpForUser } from "@/lib/core/rsvpCancel";

/**
 * Cancel an RSVP. The rules (owner or guest ticket token, waitlist promotion)
 * live in lib/core/rsvpCancel.ts and are shared with the mobile API.
 */
export async function cancelRsvp(input: unknown): Promise<ActionResult<{ cancelled: true }>> {
  const session = await auth();
  return cancelRsvpForUser(session?.user?.id ?? null, input);
}
