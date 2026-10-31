import crypto from "node:crypto";

/*
 * Pure cryptographic helpers for the OIDC provider: credential generation and
 * digests, PKCE S256, exact redirect URI matching and the pairwise subject.
 * Raw codes, tokens and secrets are never persisted; only their SHA-256 hex
 * digests are. Each value has a type prefix, so an access token can never be
 * presented as a refresh token, a code, or a mobile/machine credential.
 */

export const CLIENT_ID_PATTERN = /^yyc_[A-Za-z0-9_-]{22}$/;
export const CLIENT_SECRET_PATTERN = /^yys_[A-Za-z0-9_-]{43}$/;
export const CODE_PATTERN = /^yoc_[A-Za-z0-9_-]{43}$/;
export const ACCESS_TOKEN_PATTERN = /^yoa_[A-Za-z0-9_-]{43}$/;
export const REFRESH_TOKEN_PATTERN = /^yor_[A-Za-z0-9_-]{43}$/;
/** Client-credentials (machine) access token; never accepted where a user token is expected. */
export const CLIENT_TOKEN_PATTERN = /^yoi_[A-Za-z0-9_-]{43}$/;
/** RFC 7636 §4.1: 43–128 unreserved characters. */
export const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
/** base64url(SHA-256) without padding is always 43 characters. */
export const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function random(prefix: string, bytes = 32) {
  return `${prefix}${crypto.randomBytes(bytes).toString("base64url")}`;
}

export const generateClientId = () => random("yyc_", 16);
export const generateClientSecret = () => random("yys_");
export const generateAuthorizationCode = () => random("yoc_");
export const generateAccessToken = () => random("yoa_");
export const generateRefreshToken = () => random("yor_");
export const generateClientToken = () => random("yoi_");
export const generatePairwiseSalt = () => crypto.randomBytes(32).toString("base64url");

/** Constant-time comparison of two hex digests of equal, known length. */
export function digestsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === 32 && right.length === 32 && crypto.timingSafeEqual(left, right);
}

/** RFC 7636 S256: BASE64URL(SHA256(ASCII(code_verifier))). */
export function pkceChallengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/**
 * Verify a PKCE verifier against the stored S256 challenge. `plain` is never
 * accepted, so the stored method is checked too.
 */
export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== "S256") return false;
  if (!CODE_VERIFIER_PATTERN.test(verifier) || !CODE_CHALLENGE_PATTERN.test(challenge)) return false;
  const expected = Buffer.from(pkceChallengeFor(verifier));
  const actual = Buffer.from(challenge);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/**
 * A redirect URI may be registered only if it is absolute, has no fragment or
 * user info, and is HTTPS (HTTP only for a loopback host, for local
 * development). Registered values are compared byte for byte at authorize time.
 */
export function isRegistrableRedirectUri(value: string): boolean {
  if (value.length > 2000 || value !== value.trim()) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || value.includes("#") || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/** Exact string match only: no prefix, wildcard, case or trailing-slash leniency. */
export function redirectUriMatches(requested: string, registered: readonly string[]): boolean {
  return registered.includes(requested);
}

/**
 * Pairwise subject identifier (OIDC Core §8.1). Each client has its own random
 * salt, so two clients see unrelated `sub` values for the same person and no
 * client learns Yuyu's internal user id. The value is stable for the client's
 * lifetime because the salt never changes.
 */
export function pairwiseSubject(salt: string, userId: string): string {
  return crypto.createHmac("sha256", Buffer.from(salt, "base64url")).update(`yuyu-oidc-sub-v1|${userId}`, "utf8").digest("base64url");
}

/** Parse `Authorization: Basic base64(client_id:client_secret)` (RFC 6749 §2.3.1, form-encoded parts). */
export function parseBasicClientAuth(header: string | null): { clientId: string; clientSecret: string } | null {
  const match = header?.trim().match(/^Basic[ \t]+([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator <= 0) return null;
  try {
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator).replace(/\+/g, " ")),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1).replace(/\+/g, " ")),
    };
  } catch {
    return null;
  }
}

/** Parse `Authorization: Bearer <access token>`; anything else is null. */
export function parseOAuthBearer(header: string | null): string | null {
  const match = header?.trim().match(/^Bearer[ \t]+([^ \t]+)$/i);
  const token = match?.[1];
  return token && ACCESS_TOKEN_PATTERN.test(token) ? token : null;
}
