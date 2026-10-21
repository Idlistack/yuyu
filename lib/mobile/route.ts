import "server-only";

import crypto from "node:crypto";
import { withApiMonitoring } from "@/lib/apiMonitor";
import { requireMobileUser, optionalMobileUser, type MobileAuthContext } from "@/lib/mobileAuth";
import { mobileError } from "@/lib/mobile/http";
import { getRequestOrigin } from "@/lib/publicUrl";
import { checkRateLimitById } from "@/lib/rateLimit";

/*
 * Route plumbing for /api/mobile/v1: monitoring, a generic INTERNAL_ERROR for
 * unexpected exceptions (category-only logging), bearer authentication and a
 * per-user request limit.
 */

export type RouteParams<T extends Record<string, string> = Record<string, string>> = { params: Promise<T> };

export type MobileRouteContext = {
  baseUrl: string;
};

export type AuthedRouteContext = MobileRouteContext & { auth: MobileAuthContext };

/** Absolute public origin used for image and link URLs. */
export async function mobileBaseUrl() {
  return (await getRequestOrigin()).replace(/\/$/, "");
}

function userRateKey(userId: string) {
  return `user:${crypto.createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

export function mobileRoute<P extends Record<string, string>>(
  routeId: string,
  handler: (request: Request, params: P, context: MobileRouteContext & { auth: MobileAuthContext | null }) => Promise<Response>,
  options: { optionalAuth?: boolean } = {},
) {
  return withApiMonitoring(routeId, async (request: Request, segment?: RouteParams<P>) => {
    try {
      const params = (await segment?.params) ?? ({} as P);
      const auth = options.optionalAuth ? await optionalMobileUser(request) : null;
      if (options.optionalAuth && request.headers.get("authorization") && !auth) return mobileError("UNAUTHENTICATED");
      return await handler(request, params, { baseUrl: await mobileBaseUrl(), auth });
    } catch {
      console.error(`[mobile-api] ${routeId} failed`);
      return mobileError("INTERNAL_ERROR");
    }
  });
}

export function authedMobileRoute<P extends Record<string, string>>(
  routeId: string,
  handler: (request: Request, params: P, context: AuthedRouteContext) => Promise<Response>,
) {
  return withApiMonitoring(routeId, async (request: Request, segment?: RouteParams<P>) => {
    try {
      const auth = await requireMobileUser(request);
      if (!auth) return mobileError("UNAUTHENTICATED");
      if (!(await checkRateLimitById("mobileApi", userRateKey(auth.userId)))) return mobileError("RATE_LIMITED");
      const params = (await segment?.params) ?? ({} as P);
      return await handler(request, params, { baseUrl: await mobileBaseUrl(), auth });
    } catch {
      console.error(`[mobile-api] ${routeId} failed`);
      return mobileError("INTERNAL_ERROR");
    }
  });
}
