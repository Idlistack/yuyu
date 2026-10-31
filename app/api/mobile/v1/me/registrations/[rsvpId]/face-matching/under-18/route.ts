import { mobileError, mobileOk, notFound } from "@/lib/mobile/http";
import { authedMobileRoute } from "@/lib/mobile/route";
import { recordUnder18Attestation } from "@/lib/pgIntegration/selfie";

type Params = { rsvpId: string };

/** "I'm under 18": face matching stays off for this registration (decision D-12). */
export const POST = authedMobileRoute<Params>("POST /api/mobile/v1/me/registrations/:rsvpId/face-matching/under-18", async (_request, { rsvpId }, { auth }) => {
  const result = await recordUnder18Attestation(auth.userId, rsvpId);
  if (result.ok) return mobileOk(null);
  return result.error === "not_found" ? notFound() : mobileError("CONFLICT", "Face matching isn't available for this registration.");
});
