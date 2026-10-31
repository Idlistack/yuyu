import { mobileError, mobileOk, notFound, parseJsonBody } from "@/lib/mobile/http";
import { authedMobileRoute } from "@/lib/mobile/route";
import { selfieTicketDtoSchema } from "@/lib/mobile/schemas";
import { issueSelfieTicket } from "@/lib/pgIntegration/selfie";
import { mobileSelfieTicketBodySchema } from "@/lib/pgIntegration/selfieInput";

type Params = { rsvpId: string };

/**
 * Records consent to the current notice and the 18+ attestation, and returns
 * a 10-minute single-use ticket. The app then POSTs the photo straight to
 * `uploadUrl` (People's Gallery) as multipart `ticket` + `file`; Yuyu never
 * receives the image (decision D-Selfie).
 */
export const POST = authedMobileRoute<Params>("POST /api/mobile/v1/me/registrations/:rsvpId/face-matching/ticket", async (request, { rsvpId }, { auth }) => {
  const body = await parseJsonBody(request, mobileSelfieTicketBodySchema);
  if ("response" in body) return body.response;
  const result = await issueSelfieTicket(auth.userId, rsvpId, { noticeVersion: body.data.noticeVersion });
  if (result.ok) {
    return mobileOk(selfieTicketDtoSchema.parse({ ticket: result.ticket, uploadUrl: result.uploadUrl, expiresAt: result.expiresAt, action: result.action }));
  }
  switch (result.error) {
    case "not_found":
      return notFound();
    case "rate_limited":
      return mobileError("RATE_LIMITED", "Too many selfie uploads in the last hour.", { retryAfter: 3600 });
    case "consent_required":
      return mobileError("CONFLICT", "The face-matching notice changed. Show the current notice and ask again.");
    case "minor":
      return mobileError("FORBIDDEN", "Face matching is only for people aged 18 or older.");
    default:
      return mobileError("CONFLICT", "Face matching isn't available for this registration.");
  }
});
