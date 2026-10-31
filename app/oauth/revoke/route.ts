import { revokeRequestSchema } from "@/lib/oidc/dto";
import { allowIp, clientCredentials, invalidClient, limitKey, oauthError, rateLimited, readForm, NO_STORE_HEADERS } from "@/lib/oidc/http";
import { CLIENT_ID_PATTERN } from "@/lib/oidc/primitives";
import { authenticateClient, revokeToken } from "@/lib/oidc/provider";
import { checkRateLimitById } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * RFC 7009 token revocation. An authenticated client may revoke its own
 * access or refresh token, which ends the whole session. Unknown tokens and
 * other clients' tokens get the same empty 200.
 */
export async function POST(request: Request) {
  try {
    const form = await readForm(request);
    if (!form) {
      if (!(await allowIp("oauthToken", request.headers))) return rateLimited();
      return oauthError("invalid_request", "Send an application/x-www-form-urlencoded body without repeated parameters.");
    }
    const credentials = clientCredentials(request, form);
    if (credentials && CLIENT_ID_PATTERN.test(credentials.clientId)) {
      if (!(await checkRateLimitById("oauthToken", limitKey("client", credentials.clientId)))) return rateLimited();
    } else if (!(await allowIp("oauthToken", request.headers))) {
      return rateLimited();
    }
    const client = await authenticateClient(credentials);
    if (!client) return invalidClient(Boolean(request.headers.get("authorization")));
    const parsed = revokeRequestSchema.safeParse(form);
    if (!parsed.success) return oauthError("invalid_request", "token is required.");
    await revokeToken(client, parsed.data.token);
    return new Response(null, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    console.error("[oidc] revocation failed");
    return oauthError("server_error", undefined, 500);
  }
}
