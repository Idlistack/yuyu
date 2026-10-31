import { faceMatchingDtoSchema } from "@/lib/mobile/schemas";
import { mobileOk, notFound } from "@/lib/mobile/http";
import { authedMobileRoute } from "@/lib/mobile/route";
import { FACE_NOTICE, FACE_NOTICE_VERSION } from "@/lib/pgIntegration/faceNotice";
import { loadFaceMatchingView, withdrawFaceMatching } from "@/lib/pgIntegration/selfie";

type Params = { rsvpId: string };

const notice = { version: FACE_NOTICE_VERSION, ...FACE_NOTICE, points: [...FACE_NOTICE.points] };

/**
 * Face matching for one of the caller's own registrations: the versioned
 * notice to show before the camera and the current state. Anyone else's RSVP
 * is NOT_FOUND (docs/PG_INTEGRATION.md#selfie-step).
 */
export const GET = authedMobileRoute<Params>("GET /api/mobile/v1/me/registrations/:rsvpId/face-matching", async (_request, { rsvpId }, { auth }) => {
  const view = await loadFaceMatchingView(auth.userId, rsvpId);
  if (!view.available && view.reason === "not_found") return notFound();
  return mobileOk(faceMatchingDtoSchema.parse(view.available
    ? { available: true, reason: null, notice, state: view.state }
    : { available: false, reason: view.reason, notice, state: null }));
});

/** "Stop face matching": People's Gallery deletes the selfie and the matches. */
export const DELETE = authedMobileRoute<Params>("DELETE /api/mobile/v1/me/registrations/:rsvpId/face-matching", async (_request, { rsvpId }, { auth }) => {
  const result = await withdrawFaceMatching(auth.userId, rsvpId);
  return result.ok ? mobileOk(null) : notFound();
});
