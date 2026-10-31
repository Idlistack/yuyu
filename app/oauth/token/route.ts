import { clientCredentialsResponseSchema, tokenRequestSchema, tokenResponseSchema } from "@/lib/oidc/dto";
import { allowIp, clientCredentials, invalidClient, limitKey, oauthError, oauthJson, rateLimited, readForm } from "@/lib/oidc/http";
import { CLIENT_ID_PATTERN } from "@/lib/oidc/primitives";
import { authenticateClient, exchangeAuthorizationCode, issueClientCredentialsToken, refreshTokens } from "@/lib/oidc/provider";
import { checkRateLimitById } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * OAuth 2.0 token endpoint: authorization_code (PKCE S256 mandatory),
 * refresh_token (rotating) and client_credentials (first-party machine scopes
 * such as `yuyu.integration`, docs/PG_INTEGRATION.md). Responses are `no-store`; errors use the RFC 6749
 * §5.2 codes and never say which check failed beyond that.
 */
export async function POST(request: Request) {
  try {
    const form = await readForm(request);
    if (!form) {
      if (!(await allowIp("oauthToken", request.headers))) return rateLimited();
      return oauthError("invalid_request", "Send an application/x-www-form-urlencoded body without repeated parameters.");
    }
    const credentials = clientCredentials(request, form);
    // Keyed by client: one relying-party backend calls for every attendee.
    const allowed = credentials && CLIENT_ID_PATTERN.test(credentials.clientId)
      ? await checkRateLimitById("oauthToken", limitKey("client", credentials.clientId))
      : await allowIp("oauthToken", request.headers);
    if (!allowed) return rateLimited();

    const client = await authenticateClient(credentials);
    if (!client) return invalidClient(credentials?.method === "basic" || Boolean(request.headers.get("authorization")));

    if (form.grant_type !== "authorization_code" && form.grant_type !== "refresh_token" && form.grant_type !== "client_credentials") {
      return oauthError(form.grant_type ? "unsupported_grant_type" : "invalid_request", "grant_type must be authorization_code, refresh_token or client_credentials.");
    }
    const parsed = tokenRequestSchema.safeParse(form);
    if (!parsed.success) return oauthError("invalid_request", "Missing or invalid parameters.");

    if (parsed.data.grant_type === "client_credentials") {
      const issued = await issueClientCredentialsToken({ client, scope: parsed.data.scope });
      if ("error" in issued) return oauthError(issued.error, issued.description);
      return oauthJson(clientCredentialsResponseSchema.parse(issued));
    }

    const outcome = parsed.data.grant_type === "authorization_code"
      ? await exchangeAuthorizationCode({ client, code: parsed.data.code, redirectUri: parsed.data.redirect_uri, codeVerifier: parsed.data.code_verifier })
      : await refreshTokens({ client, refreshToken: parsed.data.refresh_token, scope: parsed.data.scope });
    if ("error" in outcome) return oauthError(outcome.error, outcome.description);
    return oauthJson(tokenResponseSchema.parse(outcome));
  } catch {
    console.error("[oidc] token request failed");
    return oauthError("server_error", undefined, 500);
  }
}
