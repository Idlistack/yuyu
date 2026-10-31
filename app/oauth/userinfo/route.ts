import { allowIp, limitKey, oauthJson, rateLimited } from "@/lib/oidc/http";
import { parseOAuthBearer } from "@/lib/oidc/primitives";
import { userInfoForAccessToken } from "@/lib/oidc/provider";
import { checkRateLimitById } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized(error?: "invalid_token" | "invalid_request") {
  return new Response(null, {
    status: error === "invalid_request" ? 400 : 401,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      "WWW-Authenticate": error ? `Bearer realm="yuyu-oauth", error="${error}"` : 'Bearer realm="yuyu-oauth"',
    },
  });
}

/**
 * OIDC UserInfo: the pairwise `sub`, and with `profile` the name and picture.
 * Never an email address (People's Gallery D-Mail/D-3). Bearer header only;
 * tokens in the query string are refused.
 */
async function handle(request: Request) {
  try {
    if (new URL(request.url).searchParams.has("access_token")) return unauthorized("invalid_request");
    const header = request.headers.get("authorization");
    const token = parseOAuthBearer(header);
    if (!token) {
      if (!(await allowIp("oauthUserinfo", request.headers))) return rateLimited();
      return unauthorized(header ? "invalid_token" : undefined);
    }
    const resolved = await userInfoForAccessToken(token);
    if (!resolved) {
      if (!(await allowIp("oauthUserinfo", request.headers))) return rateLimited();
      return unauthorized("invalid_token");
    }
    if (!(await checkRateLimitById("oauthUserinfo", limitKey("session", resolved.sessionId)))) return rateLimited();
    return oauthJson(resolved.claims);
  } catch {
    console.error("[oidc] userinfo failed");
    return new Response(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = handle;
export const POST = handle;
