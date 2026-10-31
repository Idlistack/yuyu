import "server-only";

import crypto from "node:crypto";
import { oauthErrorSchema, type OAuthErrorBody } from "@/lib/oidc/dto";
import { parseBasicClientAuth } from "@/lib/oidc/primitives";
import type { ClientCredentials } from "@/lib/oidc/provider";
import { checkRateLimitById, getClientIpFromHeaders, type Bucket } from "@/lib/rateLimit";

/** Token, userinfo and revocation responses carry credentials or personal data. */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE_HEADERS, ...extra } });
}

export function oauthError(error: OAuthErrorBody["error"], description?: string, status = 400, extra: Record<string, string> = {}) {
  return oauthJson(oauthErrorSchema.parse({ error, ...(description ? { error_description: description } : {}) }), status, extra);
}

export function rateLimited() {
  return oauthError("temporarily_unavailable", "Too many requests. Try again later.", 429, { "Retry-After": "60" });
}

/** A privacy-safe rate-limit subject (hashed, so raw ids never reach Redis keys). */
export function limitKey(kind: string, value: string) {
  return `${kind}:${crypto.createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

export async function allowIp(bucket: Bucket, headers: Headers) {
  return checkRateLimitById(bucket, `ip:${getClientIpFromHeaders(headers)}`);
}

const MAX_FORM_BYTES = 8 * 1024;

/**
 * Read an `application/x-www-form-urlencoded` body (RFC 6749 §3.2), capped in
 * size. A parameter sent twice makes the request invalid.
 */
export async function readForm(request: Request): Promise<Record<string, string> | null> {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return null;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_FORM_BYTES) return null;
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_FORM_BYTES) return null;
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in result) return null;
    result[key] = value;
  }
  return result;
}

/**
 * The client's credentials from HTTP Basic (client_secret_basic) or the form
 * body (client_secret_post, or client_id alone for a public client). Using
 * both methods at once is refused (RFC 6749 §2.3).
 */
export function clientCredentials(request: Request, form: Record<string, string>): ClientCredentials | null {
  const header = request.headers.get("authorization");
  if (header) {
    if (form.client_secret !== undefined) return null;
    const basic = parseBasicClientAuth(header);
    if (!basic || (form.client_id !== undefined && form.client_id !== basic.clientId)) return null;
    return { clientId: basic.clientId, clientSecret: basic.clientSecret, method: "basic" };
  }
  if (!form.client_id) return null;
  return form.client_secret !== undefined
    ? { clientId: form.client_id, clientSecret: form.client_secret, method: "post" }
    : { clientId: form.client_id, clientSecret: null, method: "none" };
}

export function invalidClient(usedBasic: boolean) {
  return oauthError("invalid_client", "Client authentication failed.", 401, usedBasic ? { "WWW-Authenticate": 'Basic realm="yuyu-oauth"' } : {});
}
