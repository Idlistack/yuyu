import { isActionRateLimited } from "@/lib/actionRateLimit";
import { revokeAllSessionsForUser } from "@/lib/core/accountSecurity";
import { mobileError, mobileOk } from "@/lib/mobile/http";
import { authedMobileRoute } from "@/lib/mobile/route";

/**
 * "Sign out everywhere": the same transaction as the web security page. The
 * web additionally requires a recent sign-in; a mobile session can only use
 * this to reduce access (it signs itself out too), so it is not re-prompted.
 */
export const POST = authedMobileRoute("POST /api/mobile/v1/auth/logout-all", async (_request, _params, { auth }) => {
  if (await isActionRateLimited("auth", auth.userId)) return mobileError("RATE_LIMITED", "Too many attempts. Please try again later.");
  await revokeAllSessionsForUser(auth.userId);
  return mobileOk(null);
});
