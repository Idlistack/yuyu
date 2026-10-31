import "server-only";

import type { Prisma } from "@prisma/client";
import { SignJWT } from "jose";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import {
  ACCESS_TOKEN_TTL_MS,
  AUTHORIZATION_CODE_TTL_MS,
  CLIENT_CREDENTIALS_SCOPES,
  CLIENT_TOKEN_TTL_MS,
  ID_TOKEN_ALG,
  ID_TOKEN_TTL_SECONDS,
  REFRESH_REUSE_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
  oidcIssuer,
  parseScopes,
  scopesCovered,
  type OidcScope,
} from "@/lib/oidc/config";
import { authorizeRequestSchema, userInfoSchema, type UserInfo } from "@/lib/oidc/dto";
import { getActiveSigningKey } from "@/lib/oidc/keys";
import {
  ACCESS_TOKEN_PATTERN,
  CLIENT_ID_PATTERN,
  CLIENT_TOKEN_PATTERN,
  CLIENT_SECRET_PATTERN,
  CODE_PATTERN,
  REFRESH_TOKEN_PATTERN,
  digestsEqual,
  generateAccessToken,
  generateAuthorizationCode,
  generateClientToken,
  generateRefreshToken,
  pairwiseSubject,
  redirectUriMatches,
  sha256Hex,
  verifyPkce,
} from "@/lib/oidc/primitives";
import { decryptOidcSecret } from "@/lib/oidc/secrets";

/*
 * Yuyu's minimal first-party OpenID Connect provider (docs/OIDC_PROVIDER.md):
 * authorization code + mandatory PKCE S256, exact redirect URIs, one-time
 * consent (OAuthGrant), pairwise `sub`, short single-use codes, rotating
 * refresh tokens with reuse detection, and sessions bound to the user's
 * `sessionVersion` so password reset and "sign out everywhere" revoke them.
 * Codes, tokens and secrets are never logged, audited or stored in plain text.
 */

// ── Clients ──────────────────────────────────────────────────────────────

const clientSelect = {
  id: true, clientId: true, name: true, secretHash: true, redirectUris: true,
  allowedScopes: true, pairwiseSaltEncrypted: true, firstParty: true, status: true,
} satisfies Prisma.OAuthClientSelect;
export type OAuthClientRecord = Prisma.OAuthClientGetPayload<{ select: typeof clientSelect }>;

export async function findActiveClient(clientId: string): Promise<OAuthClientRecord | null> {
  if (!CLIENT_ID_PATTERN.test(clientId)) return null;
  const client = await prisma.oAuthClient.findUnique({ where: { clientId }, select: clientSelect });
  return client?.status === "ACTIVE" ? client : null;
}

export function subjectFor(client: Pick<OAuthClientRecord, "pairwiseSaltEncrypted">, userId: string) {
  return pairwiseSubject(decryptOidcSecret(client.pairwiseSaltEncrypted), userId);
}

export type ClientCredentials = { clientId: string; clientSecret: string | null; method: "basic" | "post" | "none" };

/**
 * Authenticate the client at the token and revocation endpoints. A client
 * registered with a secret must present it (client_secret_basic or
 * client_secret_post); a public client presents none. Every failure is the
 * same `null`, answered as `invalid_client`.
 */
export async function authenticateClient(credentials: ClientCredentials | null): Promise<OAuthClientRecord | null> {
  if (!credentials) return null;
  const client = await findActiveClient(credentials.clientId);
  if (!client) return null;
  if (client.secretHash) {
    if (!credentials.clientSecret || !CLIENT_SECRET_PATTERN.test(credentials.clientSecret)) return null;
    return digestsEqual(sha256Hex(credentials.clientSecret), client.secretHash) ? client : null;
  }
  return credentials.clientSecret === null ? client : null;
}

// ── Authorization requests ───────────────────────────────────────────────

export type ValidAuthorizeRequest = {
  client: OAuthClientRecord;
  redirectUri: string;
  scopes: OidcScope[];
  state: string;
  nonce: string;
  codeChallenge: string;
  prompt?: "none" | "consent";
};

export type AuthorizeValidation =
  /** The client or redirect URI cannot be trusted: show an error, never redirect. */
  | { kind: "fatal"; message: string }
  /** A trusted redirect URI exists: send the error back to the client. */
  | { kind: "redirect_error"; redirectUri: string; state?: string; error: string; description: string }
  | { kind: "ok"; request: ValidAuthorizeRequest };

/** Single-valued view of query parameters; a repeated parameter is a malformed request (RFC 6749 §3.1). */
export function singleValuedParams(params: URLSearchParams): Record<string, string> | null {
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in result) return null;
    result[key] = value;
  }
  return result;
}

export async function validateAuthorizeRequest(params: URLSearchParams): Promise<AuthorizeValidation> {
  const single = singleValuedParams(params);
  if (!single) return { kind: "fatal", message: "The sign-in request is malformed." };
  const client = single.client_id ? await findActiveClient(single.client_id) : null;
  if (!client) return { kind: "fatal", message: "This app is not registered with Yuyu." };
  const redirectUri = single.redirect_uri ?? "";
  if (!redirectUriMatches(redirectUri, client.redirectUris)) {
    return { kind: "fatal", message: "This app asked to return to an address Yuyu does not recognise." };
  }
  const state = typeof single.state === "string" && single.state.length <= 512 ? single.state : undefined;
  const fail = (error: string, description: string): AuthorizeValidation => ({ kind: "redirect_error", redirectUri, state, error, description });

  const parsed = authorizeRequestSchema.safeParse(single);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "response_type") return fail("unsupported_response_type", "Only response_type=code is supported.");
    if (field === "code_challenge" || field === "code_challenge_method") return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
    return fail("invalid_request", `Invalid or missing parameter${typeof field === "string" ? `: ${field}` : ""}.`);
  }
  const scopes = parseScopes(parsed.data.scope);
  if (!scopes || !scopesCovered(scopes, client.allowedScopes)) return fail("invalid_scope", "The requested scope is not allowed.");
  return {
    kind: "ok",
    request: {
      client,
      redirectUri,
      scopes,
      state: parsed.data.state,
      nonce: parsed.data.nonce,
      codeChallenge: parsed.data.code_challenge,
      prompt: parsed.data.prompt,
    },
  };
}

/** The client's redirect URI with response parameters appended. */
export function redirectWith(redirectUri: string, values: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) if (value !== undefined) url.searchParams.set(key, value);
  url.searchParams.set("iss", oidcIssuer());
  return url.toString();
}

/** Whether the user has already approved every requested scope for this client. */
export async function hasCoveringGrant(userId: string, clientDbId: string, scopes: readonly string[]) {
  const grant = await prisma.oAuthGrant.findUnique({
    where: { userId_clientId: { userId, clientId: clientDbId } },
    select: { scopes: true, revokedAt: true },
  });
  return Boolean(grant && !grant.revokedAt && scopesCovered(scopes, grant.scopes));
}

/**
 * Issue a 60-second, single-use code bound to the user's current
 * `sessionVersion`, the PKCE challenge, nonce and exact redirect URI. When
 * `approve` is set (the consent screen), the grant is created or widened in
 * the same transaction; otherwise a standing grant must already cover the
 * scopes. Returns the client redirect URL, or null when the user, grant or
 * client changed underneath.
 */
export async function issueAuthorizationCode(params: {
  request: ValidAuthorizeRequest;
  userId: string;
  authTime: Date;
  approve?: boolean;
  now?: Date;
}): Promise<string | null> {
  const { request, userId } = params;
  const now = params.now ?? new Date();
  const code = generateAuthorizationCode();
  const issued = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
    if (!user) return false;
    const existing = await tx.oAuthGrant.findUnique({
      where: { userId_clientId: { userId, clientId: request.client.id } },
      select: { id: true, scopes: true, revokedAt: true },
    });
    if (params.approve) {
      const merged = existing && !existing.revokedAt ? Array.from(new Set([...existing.scopes, ...request.scopes])) : [...request.scopes];
      const subject = subjectFor(request.client, userId);
      const grant = await tx.oAuthGrant.upsert({
        where: { userId_clientId: { userId, clientId: request.client.id } },
        create: { userId, clientId: request.client.id, scopes: merged, subject },
        update: { scopes: merged, subject, revokedAt: null, grantedAt: existing?.revokedAt ? now : undefined },
        select: { id: true },
      });
      if (!existing || existing.revokedAt || !scopesCovered(request.scopes, existing.scopes)) {
        await recordAuditEvent({
          action: "OAUTH_GRANT_APPROVED",
          actorUserId: userId,
          targetType: "OAuthGrant",
          targetId: grant.id,
          metadata: { client: request.client.clientId, scopes: merged.join(" ") },
          client: tx,
        });
      }
    } else if (!existing || existing.revokedAt || !scopesCovered(request.scopes, existing.scopes)) {
      return false;
    }
    await tx.oAuthAuthorizationCode.create({
      data: {
        codeHash: sha256Hex(code),
        clientId: request.client.id,
        userId,
        sessionVersion: user.sessionVersion,
        redirectUri: request.redirectUri,
        scopes: request.scopes,
        nonce: request.nonce,
        codeChallenge: request.codeChallenge,
        codeChallengeMethod: "S256",
        authTime: params.authTime,
        createdAt: now,
        expiresAt: new Date(now.getTime() + AUTHORIZATION_CODE_TTL_MS),
      },
    });
    return true;
  });
  return issued ? redirectWith(request.redirectUri, { code, state: request.state }) : null;
}

/** Record a refused consent. The client is told `access_denied`. */
export async function recordConsentDenied(userId: string, client: OAuthClientRecord) {
  await recordAuditEvent({
    action: "OAUTH_CONSENT_DENIED",
    actorUserId: userId,
    targetType: "OAuthClient",
    targetId: client.id,
    metadata: { client: client.clientId },
  });
}

// ── Tokens ───────────────────────────────────────────────────────────────

export type TokenSuccess = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  id_token: string;
  scope: string;
};
export type TokenFailure = { error: "invalid_grant" | "invalid_scope"; description: string };

type ProfileUser = { id: string; name: string | null; image: string | null; profileImageUrl: string | null };
const profileSelect = { id: true, name: true, image: true, profileImageUrl: true } satisfies Prisma.UserSelect;

/** An absolute http(s) picture URL, or undefined. Never a Gravatar (that would leak an email hash). */
export function pictureUrl(user: Pick<ProfileUser, "image" | "profileImageUrl">, issuer = oidcIssuer()): string | undefined {
  const raw = user.profileImageUrl?.trim() || user.image?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw, `${issuer}/`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Claims about the person, limited by scope. Never email (D-Mail/D-3). */
export function profileClaims(user: ProfileUser, scopes: readonly string[], sub: string): UserInfo {
  const claims: UserInfo = { sub };
  if (scopes.includes("profile")) {
    const name = user.name?.trim();
    if (name) claims.name = name.slice(0, 200);
    const picture = pictureUrl(user);
    if (picture) claims.picture = picture;
  }
  return userInfoSchema.parse(claims);
}

async function signIdToken(params: {
  client: OAuthClientRecord;
  user: ProfileUser;
  scopes: readonly string[];
  authTime: Date;
  nonce?: string | null;
  now: Date;
}) {
  const key = await getActiveSigningKey();
  const { sub, ...profile } = profileClaims(params.user, params.scopes, subjectFor(params.client, params.user.id));
  const iat = Math.floor(params.now.getTime() / 1000);
  return new SignJWT({
    auth_time: Math.floor(params.authTime.getTime() / 1000),
    ...(params.nonce ? { nonce: params.nonce } : {}),
    ...profile,
  })
    .setProtectedHeader({ alg: ID_TOKEN_ALG, kid: key.kid, typ: "JWT" })
    .setIssuer(oidcIssuer())
    .setAudience(params.client.clientId)
    .setSubject(sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ID_TOKEN_TTL_SECONDS)
    .sign(key.privateKey);
}

function freshTokens(now: Date) {
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  return {
    accessToken,
    refreshToken,
    accessTokenHash: sha256Hex(accessToken),
    refreshTokenHash: sha256Hex(refreshToken),
    accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
    refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  };
}

const invalidGrant = (description: string): TokenFailure => ({ error: "invalid_grant", description });

/**
 * Exchange an authorization code. The code must belong to this client, be
 * unexpired and unused, match the redirect URI exactly and the PKCE verifier,
 * and the user's sessionVersion and grant must be unchanged. A second use of a
 * code revokes the tokens issued from it (RFC 6749 §4.1.2).
 */
export async function exchangeAuthorizationCode(params: {
  client: OAuthClientRecord;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  now?: Date;
}): Promise<TokenSuccess | TokenFailure> {
  const now = params.now ?? new Date();
  if (!CODE_PATTERN.test(params.code)) return invalidGrant("The authorization code is invalid.");
  const stored = await prisma.oAuthAuthorizationCode.findUnique({
    where: { codeHash: sha256Hex(params.code) },
    select: {
      id: true, clientId: true, userId: true, sessionVersion: true, redirectUri: true, scopes: true,
      nonce: true, codeChallenge: true, codeChallengeMethod: true, authTime: true, expiresAt: true, usedAt: true,
    },
  });
  if (!stored || stored.clientId !== params.client.id) return invalidGrant("The authorization code is invalid.");

  if (stored.usedAt) {
    await prisma.$transaction(async (tx) => {
      const revoked = await tx.oAuthSession.updateMany({ where: { codeId: stored.id, revokedAt: null }, data: { revokedAt: now } });
      if (revoked.count > 0) {
        await recordAuditEvent({
          action: "OAUTH_CODE_REUSED",
          actorUserId: stored.userId,
          targetType: "OAuthClient",
          targetId: params.client.id,
          metadata: { client: params.client.clientId },
          client: tx,
        });
      }
    });
    return invalidGrant("The authorization code is invalid.");
  }
  if (stored.expiresAt <= now) return invalidGrant("The authorization code has expired.");
  if (stored.redirectUri !== params.redirectUri) return invalidGrant("redirect_uri does not match the authorization request.");
  if (!verifyPkce(params.codeVerifier, stored.codeChallenge, stored.codeChallengeMethod)) return invalidGrant("PKCE verification failed.");

  const user = await prisma.user.findUnique({ where: { id: stored.userId }, select: { ...profileSelect, sessionVersion: true } });
  if (!user || user.sessionVersion !== stored.sessionVersion) return invalidGrant("The authorization code is invalid.");

  const tokens = freshTokens(now);
  const session = await prisma.$transaction(async (tx) => {
    // Single winner: the usedAt/expiresAt predicate makes concurrent redemption safe.
    const claimed = await tx.oAuthAuthorizationCode.updateMany({
      where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;
    const grant = await tx.oAuthGrant.findUnique({
      where: { userId_clientId: { userId: stored.userId, clientId: params.client.id } },
      select: { id: true, scopes: true, revokedAt: true },
    });
    if (!grant || grant.revokedAt || !scopesCovered(stored.scopes, grant.scopes)) return null;
    const created = await tx.oAuthSession.create({
      data: {
        userId: stored.userId,
        clientId: params.client.id,
        grantId: grant.id,
        codeId: stored.id,
        sessionVersion: stored.sessionVersion,
        scopes: stored.scopes,
        authTime: stored.authTime,
        accessTokenHash: tokens.accessTokenHash,
        refreshTokenHash: tokens.refreshTokenHash,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
        createdAt: now,
        lastUsedAt: now,
      },
      select: { id: true },
    });
    await recordAuditEvent({
      action: "OAUTH_TOKENS_ISSUED",
      actorUserId: stored.userId,
      targetType: "OAuthSession",
      targetId: created.id,
      metadata: { client: params.client.clientId, grant: "authorization_code" },
      client: tx,
    });
    return created;
  });
  if (!session) return invalidGrant("The authorization code is invalid.");

  return {
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: tokens.refreshToken,
    id_token: await signIdToken({ client: params.client, user, scopes: stored.scopes, authTime: stored.authTime, nonce: stored.nonce, now }),
    scope: stored.scopes.join(" "),
  };
}

/**
 * Rotate a refresh token. The previous token replayed after the grace window
 * revokes the session (it was copied); inside the window it is refused
 * without revoking (a lost response). A changed sessionVersion, a revoked
 * grant or a disabled client end the session.
 */
export async function refreshTokens(params: {
  client: OAuthClientRecord;
  refreshToken: string;
  scope?: string;
  now?: Date;
}): Promise<TokenSuccess | TokenFailure> {
  const now = params.now ?? new Date();
  if (!REFRESH_TOKEN_PATTERN.test(params.refreshToken)) return invalidGrant("The refresh token is invalid.");
  const presentedHash = sha256Hex(params.refreshToken);
  const session = await prisma.oAuthSession.findUnique({
    where: { refreshTokenHash: presentedHash },
    select: {
      id: true, userId: true, clientId: true, sessionVersion: true, scopes: true, authTime: true,
      refreshExpiresAt: true, revokedAt: true,
      grant: { select: { revokedAt: true } },
      user: { select: { ...profileSelect, sessionVersion: true } },
    },
  });

  if (!session) {
    const replayed = await prisma.oAuthSession.findUnique({
      where: { previousRefreshTokenHash: presentedHash },
      select: { id: true, userId: true, clientId: true, revokedAt: true, rotatedAt: true },
    });
    if (replayed && replayed.clientId === params.client.id && !replayed.revokedAt && replayed.rotatedAt
      && now.getTime() - replayed.rotatedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
      await prisma.$transaction(async (tx) => {
        const revoked = await tx.oAuthSession.updateMany({ where: { id: replayed.id, revokedAt: null }, data: { revokedAt: now } });
        if (revoked.count === 1) {
          await recordAuditEvent({
            action: "OAUTH_REFRESH_TOKEN_REUSED",
            actorUserId: replayed.userId,
            targetType: "OAuthSession",
            targetId: replayed.id,
            metadata: { client: params.client.clientId },
            client: tx,
          });
        }
      });
    }
    return invalidGrant("The refresh token is invalid.");
  }

  if (session.clientId !== params.client.id || session.revokedAt || session.grant.revokedAt
    || session.refreshExpiresAt <= now || session.sessionVersion !== session.user.sessionVersion) {
    return invalidGrant("The refresh token is invalid.");
  }

  let scopes = session.scopes;
  if (params.scope !== undefined) {
    const narrowed = parseScopes(params.scope);
    if (!narrowed || !scopesCovered(narrowed, session.scopes)) return { error: "invalid_scope", description: "The requested scope exceeds the original grant." };
    scopes = narrowed;
  }

  const tokens = freshTokens(now);
  const rotated = await prisma.oAuthSession.updateMany({
    where: { id: session.id, refreshTokenHash: presentedHash, revokedAt: null, sessionVersion: session.user.sessionVersion },
    data: {
      accessTokenHash: tokens.accessTokenHash,
      refreshTokenHash: tokens.refreshTokenHash,
      previousRefreshTokenHash: presentedHash,
      rotatedAt: now,
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      lastUsedAt: now,
      scopes,
    },
  });
  if (rotated.count !== 1) return invalidGrant("The refresh token is invalid.");

  return {
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: tokens.refreshToken,
    id_token: await signIdToken({ client: params.client, user: session.user, scopes, authTime: session.authTime, now }),
    scope: scopes.join(" "),
  };
}

/**
 * Resolve a bearer access token for /oauth/userinfo. Expired, revoked,
 * version-stale, grant-revoked and disabled-client tokens all return null.
 */
export async function userInfoForAccessToken(token: string, now = new Date()): Promise<{ claims: UserInfo; sessionId: string } | null> {
  if (!ACCESS_TOKEN_PATTERN.test(token)) return null;
  const session = await prisma.oAuthSession.findUnique({
    where: { accessTokenHash: sha256Hex(token) },
    select: {
      id: true, scopes: true, sessionVersion: true, accessExpiresAt: true, revokedAt: true,
      grant: { select: { revokedAt: true } },
      client: { select: { status: true, pairwiseSaltEncrypted: true } },
      user: { select: { ...profileSelect, sessionVersion: true } },
    },
  });
  if (!session || session.revokedAt || session.grant.revokedAt || session.client.status !== "ACTIVE"
    || session.accessExpiresAt <= now || session.sessionVersion !== session.user.sessionVersion) return null;
  return { claims: profileClaims(session.user, session.scopes, subjectFor(session.client, session.user.id)), sessionId: session.id };
}

/**
 * RFC 7009 revocation. A token of this client (access or refresh, current or
 * just rotated) revokes its whole session. Unknown tokens and other clients'
 * tokens change nothing and are answered identically.
 */
export async function revokeToken(client: OAuthClientRecord, token: string, now = new Date()) {
  const hash = ACCESS_TOKEN_PATTERN.test(token) || REFRESH_TOKEN_PATTERN.test(token) ? sha256Hex(token) : null;
  if (!hash) return;
  await prisma.$transaction(async (tx) => {
    const session = await tx.oAuthSession.findFirst({
      where: { clientId: client.id, OR: [{ accessTokenHash: hash }, { refreshTokenHash: hash }, { previousRefreshTokenHash: hash }] },
      select: { id: true, userId: true },
    });
    if (!session) return;
    const revoked = await tx.oAuthSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
    if (revoked.count === 1) {
      await recordAuditEvent({
        action: "OAUTH_TOKEN_REVOKED",
        actorUserId: session.userId,
        targetType: "OAuthSession",
        targetId: session.id,
        metadata: { client: client.clientId },
        client: tx,
      });
    }
  });
}

/**
 * Mark every live OAuth session of a user revoked. Bumping `sessionVersion`
 * already invalidates them at use time; this keeps rows truthful. Call inside
 * the transaction that bumps the version (password change/reset, MFA change,
 * "sign out everywhere"), next to revokeUserMobileSessions.
 */
export function revokeUserOAuthSessions(client: Prisma.TransactionClient, userId: string) {
  return client.oAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

// ── Client credentials (machine tokens) ──────────────────────────────────

export type ClientTokenSuccess = { access_token: string; token_type: "Bearer"; expires_in: number; scope: string };

/**
 * `grant_type=client_credentials` for a confidential first-party client whose
 * allowed scopes include a machine scope (CLIENT_CREDENTIALS_SCOPES). The token
 * is opaque (`yoi_`), lives 10 minutes, carries no user and is stored as a
 * digest. It is never accepted by /oauth/userinfo.
 */
export async function issueClientCredentialsToken(params: {
  client: OAuthClientRecord;
  scope?: string;
  now?: Date;
}): Promise<ClientTokenSuccess | { error: "unauthorized_client" | "invalid_scope"; description: string }> {
  const now = params.now ?? new Date();
  const allowed = CLIENT_CREDENTIALS_SCOPES.filter((scope) => params.client.allowedScopes.includes(scope));
  if (!params.client.secretHash || !params.client.firstParty || allowed.length === 0) {
    return { error: "unauthorized_client", description: "This client may not use client_credentials." };
  }
  let scopes: string[] = [...allowed];
  if (params.scope !== undefined) {
    const requested = params.scope.split(" ").filter(Boolean);
    if (requested.length === 0 || new Set(requested).size !== requested.length || !requested.every((scope) => (allowed as string[]).includes(scope))) {
      return { error: "invalid_scope", description: "The requested scope is not allowed." };
    }
    scopes = requested;
  }
  const token = generateClientToken();
  await prisma.oAuthClientToken.create({
    data: { clientId: params.client.id, tokenHash: sha256Hex(token), scopes, expiresAt: new Date(now.getTime() + CLIENT_TOKEN_TTL_MS), createdAt: now },
  });
  return { access_token: token, token_type: "Bearer", expires_in: Math.floor(CLIENT_TOKEN_TTL_MS / 1000), scope: scopes.join(" ") };
}

/** Resolve a `yoi_` bearer token: unexpired, issued to a still-active client. */
export async function authenticateClientToken(token: string, now = new Date()): Promise<{ clientId: string; scopes: string[] } | null> {
  if (!CLIENT_TOKEN_PATTERN.test(token)) return null;
  const row = await prisma.oAuthClientToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: { clientId: true, scopes: true, expiresAt: true, client: { select: { status: true } } },
  });
  if (!row || row.expiresAt <= now || row.client.status !== "ACTIVE") return null;
  return { clientId: row.clientId, scopes: row.scopes };
}

// ── Connected apps (account settings) ────────────────────────────────────

export async function listConnectedApps(userId: string) {
  const grants = await prisma.oAuthGrant.findMany({
    where: { userId, revokedAt: null, client: { status: "ACTIVE" } },
    orderBy: { grantedAt: "desc" },
    select: { id: true, scopes: true, grantedAt: true, client: { select: { name: true } } },
  });
  return grants.map((grant) => ({ id: grant.id, name: grant.client.name, scopes: grant.scopes, grantedAt: grant.grantedAt }));
}

/** Revoke the user's own grant and every session minted under it. */
export async function revokeConnectedApp(userId: string, grantId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.oAuthGrant.updateMany({ where: { id: grantId, userId, revokedAt: null }, data: { revokedAt: now } });
    if (updated.count !== 1) return false;
    await tx.oAuthSession.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } });
    await recordAuditEvent({ action: "OAUTH_GRANT_REVOKED", actorUserId: userId, targetType: "OAuthGrant", targetId: grantId, client: tx });
    return true;
  });
}
