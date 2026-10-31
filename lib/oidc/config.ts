/*
 * Constants and pure helpers for Yuyu's first-party OpenID Connect provider
 * (docs/OIDC_PROVIDER.md). Nothing here touches the database or secrets.
 */

/** Scopes Yuyu understands. Anything else is refused as `invalid_scope`. */
export const OIDC_SCOPES = ["openid", "profile", "yuyu.events"] as const;
export type OidcScope = (typeof OIDC_SCOPES)[number];

/**
 * What the one-time authorisation screen says each scope allows. `openid` and
 * `profile` share one line: an app that knows who you are sees your name and
 * photo, never your email address (People's Gallery plan, D-Mail/D-3).
 */
export const SCOPE_DESCRIPTIONS: Record<OidcScope, string> = {
  openid: "Know who you are",
  profile: "Know who you are",
  "yuyu.events": "See events you’re part of",
};

export const AUTHORIZATION_CODE_TTL_MS = 60_000;
export const ACCESS_TOKEN_TTL_MS = 10 * 60_000;
export const ID_TOKEN_TTL_SECONDS = 5 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
/** A retired signing key stays in the JWKS this long (> every ID token lifetime and cache). */
export const RETIRED_KEY_PUBLISH_MS = 7 * 24 * 60 * 60_000;
/** A retry with the just-rotated refresh token inside this window is refused without revoking. */
export const REFRESH_REUSE_GRACE_MS = 30_000;
export const ID_TOKEN_ALG = "ES256" as const;

/**
 * The issuer identifier. It comes only from configuration, never from request
 * headers, so a forged Host cannot change the `iss` relying parties verify.
 */
export function oidcIssuer(env: Record<string, string | undefined> = process.env): string {
  const configured = env.NEXT_PUBLIC_BASE_URL?.trim() || env.AUTH_URL?.trim() || "http://localhost:3000";
  return configured.replace(/\/+$/, "");
}

export function isKnownScope(value: string): value is OidcScope {
  return (OIDC_SCOPES as readonly string[]).includes(value);
}

/**
 * Parse a space-delimited scope string. Returns null for unknown or duplicate
 * scopes, or when `openid` is missing; this is an OpenID provider only.
 */
export function parseScopes(raw: string | null | undefined): OidcScope[] | null {
  const parts = (raw ?? "").split(" ").filter(Boolean);
  if (parts.length === 0 || parts.length > OIDC_SCOPES.length) return null;
  if (new Set(parts).size !== parts.length) return null;
  if (!parts.every(isKnownScope)) return null;
  if (!parts.includes("openid")) return null;
  return OIDC_SCOPES.filter((scope) => parts.includes(scope));
}

/** Whether every requested scope is covered by `granted`. */
export function scopesCovered(requested: readonly string[], granted: readonly string[]) {
  return requested.every((scope) => granted.includes(scope));
}

/** Distinct, ordered consent lines for a scope list. */
export function consentLines(scopes: readonly string[]): string[] {
  const lines = scopes.filter(isKnownScope).map((scope) => SCOPE_DESCRIPTIONS[scope]);
  return Array.from(new Set(lines));
}
