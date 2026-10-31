import { z } from "zod";

/**
 * Boundary input for a selfie ticket (web action and mobile API). Consent and
 * the 18+ attestation must be given explicitly in the same request; there is
 * no default and no way to mint a ticket without both.
 */
export const selfieTicketInputSchema = z.object({
  rsvpId: z.string().min(1).max(128),
  noticeVersion: z.string().min(1).max(40),
  consent: z.literal(true),
  adult: z.literal(true),
}).strict();

export const mobileSelfieTicketBodySchema = selfieTicketInputSchema.omit({ rsvpId: true });
