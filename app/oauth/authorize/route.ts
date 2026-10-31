import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { allowIp } from "@/lib/oidc/http";
import { hasCoveringGrant, issueAuthorizationCode, redirectWith, validateAuthorizeRequest } from "@/lib/oidc/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { ...headers, Location: location } });
}

/** Same-origin path for a Yuyu page, keeping the authorization query intact. */
function local(request: NextRequest, path: string) {
  return `${path}${request.nextUrl.search}`;
}

/**
 * OAuth 2.0 authorization endpoint (docs/OIDC_PROVIDER.md). Untrusted client
 * or redirect URI: the Yuyu error screen, never a redirect. Signed out: Yuyu
 * sign-in, then back here. A standing grant that covers the scopes: a code
 * straight away. Otherwise the one-time authorisation screen.
 */
export async function GET(request: NextRequest) {
  if (!(await allowIp("oauthAuthorize", request.headers))) {
    return new Response("Too many requests. Try again later.", { status: 429, headers: { ...headers, "Retry-After": "60" } });
  }
  const validation = await validateAuthorizeRequest(request.nextUrl.searchParams);
  if (validation.kind === "fatal") return redirect(local(request, "/oauth/consent"));
  if (validation.kind === "redirect_error") {
    return redirect(redirectWith(validation.redirectUri, { error: validation.error, error_description: validation.description, state: validation.state }));
  }
  const { request: authorize } = validation;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    if (authorize.prompt === "none") return redirect(redirectWith(authorize.redirectUri, { error: "login_required", state: authorize.state }));
    return redirect(`/login?callbackUrl=${encodeURIComponent(local(request, "/oauth/authorize"))}`);
  }

  if (authorize.prompt !== "consent" && (await hasCoveringGrant(userId, authorize.client.id, authorize.scopes))) {
    const authenticatedAt = (session as typeof session & { authenticatedAt?: number }).authenticatedAt;
    const location = await issueAuthorizationCode({
      request: authorize,
      userId,
      authTime: new Date(typeof authenticatedAt === "number" ? authenticatedAt : Date.now()),
    });
    if (location) return redirect(location);
  }
  if (authorize.prompt === "none") return redirect(redirectWith(authorize.redirectUri, { error: "consent_required", state: authorize.state }));
  return redirect(local(request, "/oauth/consent"));
}
