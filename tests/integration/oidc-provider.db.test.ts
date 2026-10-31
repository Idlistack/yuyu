import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";

/*
 * The OIDC provider end to end against PostgreSQL (docs/OIDC_PROVIDER.md):
 * authorize → one-time consent → code → token → userinfo → refresh → revoke,
 * plus the security properties: exact redirect URIs, mandatory PKCE, single-use
 * 60-second codes, pairwise subjects, no email, and revocation on password
 * reset, "sign out everywhere", disconnect and client disable.
 */

process.env.REDIS_URL = "";
process.env.NEXT_PUBLIC_BASE_URL = "https://yuyu.test";
process.env.TRUSTED_PROXY_IP_HEADER = "x-real-ip";
process.env.MFA_ENCRYPTION_KEY ||= Buffer.alloc(32, 9).toString("base64");

const authMock = vi.hoisted(() => vi.fn(async (): Promise<{ user: { id: string }; authenticatedAt?: number } | null> => null));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": `198.51.100.${Math.floor(Math.random() * 250)}` }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/outboxWorker", () => ({ startOutboxWorker: vi.fn() }));

import { prisma } from "@/lib/db";
import { GET as authorizeRoute } from "@/app/oauth/authorize/route";
import { POST as tokenRoute } from "@/app/oauth/token/route";
import { GET as userinfoRoute, POST as userinfoPost } from "@/app/oauth/userinfo/route";
import { POST as revokeRoute } from "@/app/oauth/revoke/route";
import { GET as jwksRoute } from "@/app/oauth/jwks/route";
import { GET as discoveryRoute } from "@/app/.well-known/openid-configuration/route";
import { approveOAuthConsent, denyOAuthConsent, disconnectOAuthApp } from "@/app/actions/oauth";
import { confirmPasswordReset } from "@/app/actions/password-reset";
import { revokeAllSessionsForUser } from "@/lib/core/accountSecurity";
import { REFRESH_REUSE_GRACE_MS } from "@/lib/oidc/config";
import { pkceChallengeFor, pairwiseSubject, sha256Hex } from "@/lib/oidc/primitives";
import { decryptOidcSecret } from "@/lib/oidc/secrets";
import { buildClient, registerArgsSchema } from "@/scripts/oauth-register-client";

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const ISSUER = "https://yuyu.test";
const REDIRECT = "http://localhost:8080/api/v2/auth/yuyu/callback";
const VERIFIER = "v".repeat(20) + randomUUID().replaceAll("-", "");
const CHALLENGE = pkceChallengeFor(VERIFIER);

type Client = { id: string; clientId: string; secret: string | null; salt: string };
const clients: { pg: Client; other: Client; pub: Client } = {} as never;
const users = { asha: "", ravi: "" };
const ashaEmail = `asha-${suffix}@example.test`;

async function register(name: string, options: { public?: boolean; scopes?: string } = {}): Promise<Client> {
  const args = registerArgsSchema.parse({ name, redirectUris: [REDIRECT], scopes: options.scopes ?? "openid profile yuyu.events", public: options.public ?? false, firstParty: true });
  const { clientSecret, data } = buildClient(args, process.env.MFA_ENCRYPTION_KEY);
  const row = await prisma.oAuthClient.create({ data, select: { id: true } });
  return { id: row.id, clientId: data.clientId, secret: clientSecret, salt: decryptOidcSecret(data.pairwiseSaltEncrypted) };
}

function signIn(userId: string | null) {
  authMock.mockResolvedValue(userId ? { user: { id: userId }, authenticatedAt: Date.now() - 5_000 } : null);
}

function authorizeQuery(client: Client, overrides: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  const values: Record<string, string | undefined> = {
    response_type: "code", client_id: client.clientId, redirect_uri: REDIRECT, scope: "openid profile yuyu.events",
    state: `st-${randomUUID()}`, nonce: `n-${randomUUID()}`, code_challenge: CHALLENGE, code_challenge_method: "S256", ...overrides,
  };
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, value);
  return params;
}

async function authorize(params: URLSearchParams | string) {
  const response = await authorizeRoute(new NextRequest(`${ISSUER}/oauth/authorize?${params.toString()}`, { headers: { "x-real-ip": "203.0.113.7" } }));
  expect(response.status).toBe(302);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return response.headers.get("location")!;
}

function form(body: Record<string, string>, init: { basic?: [string, string]; headers?: Record<string, string> } = {}) {
  return new Request(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-real-ip": "203.0.113.8",
      ...(init.basic ? { authorization: `Basic ${Buffer.from(`${encodeURIComponent(init.basic[0])}:${encodeURIComponent(init.basic[1])}`).toString("base64")}` } : {}),
      ...init.headers,
    },
    body: new URLSearchParams(body).toString(),
  });
}

/** Run the whole flow for a user who has (or is given) a grant; returns the code. */
async function obtainCode(client: Client, userId: string, overrides: Record<string, string | undefined> = {}) {
  signIn(userId);
  const query = authorizeQuery(client, overrides);
  let location = await authorize(query);
  if (location.startsWith("/oauth/consent")) {
    const result = await approveOAuthConsent(query.toString());
    expect(result.ok).toBe(true);
    location = result.ok ? result.data!.redirectTo : "";
  }
  const url = new URL(location);
  expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
  expect(url.searchParams.get("state")).toBe(query.get("state"));
  expect(url.searchParams.get("iss")).toBe(ISSUER);
  return { code: url.searchParams.get("code")!, nonce: query.get("nonce")! };
}

async function exchange(client: Client, code: string, overrides: Record<string, string> = {}) {
  const response = await tokenRoute(form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: VERIFIER, ...overrides }, { basic: client.secret ? [client.clientId, client.secret] : undefined }));
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function exchangePublic(client: Client, code: string) {
  const response = await tokenRoute(form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: VERIFIER, client_id: client.clientId }));
  return { status: response.status, body: await response.json() };
}

async function refresh(client: Client, refreshToken: string) {
  const response = await tokenRoute(form({ grant_type: "refresh_token", refresh_token: refreshToken }, { basic: [client.clientId, client.secret!] }));
  return { status: response.status, body: await response.json() };
}

async function userinfo(accessToken: string) {
  const response = await userinfoRoute(new Request(`${ISSUER}/oauth/userinfo`, { headers: { authorization: `Bearer ${accessToken}`, "x-real-ip": "203.0.113.9" } }));
  return { status: response.status, body: response.status === 200 ? await response.json() : null, headers: response.headers };
}

async function login(client: Client, userId: string) {
  const { code, nonce } = await obtainCode(client, userId);
  const result = await exchange(client, code);
  expect(result.status).toBe(200);
  return { ...result.body as { access_token: string; refresh_token: string; id_token: string; scope: string }, nonce, code };
}

async function jwks() {
  return createLocalJWKSet(await (await jwksRoute()).json());
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash("correct horse battery staple", 4);
  users.asha = (await prisma.user.create({ data: { email: ashaEmail, name: "Asha Rao", passwordHash, emailVerified: new Date(), profileImageUrl: "/api/uploads/org/u/asha.webp" } })).id;
  users.ravi = (await prisma.user.create({ data: { email: `ravi-${suffix}@example.test`, name: "Ravi", emailVerified: new Date() } })).id;
  clients.pg = await register(`People's Gallery ${suffix}`);
  clients.other = await register(`Other app ${suffix}`);
  clients.pub = await register(`Public app ${suffix}`, { public: true, scopes: "openid profile" });
});

afterAll(async () => {
  await prisma.oAuthClient.deleteMany({ where: { id: { in: Object.values(clients).map((client) => client.id) } } });
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(users) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await prisma.$disconnect();
});

beforeEach(() => signIn(null));

describe("discovery and keys", () => {
  it("publishes configuration from the configured issuer and a verifying JWKS", async () => {
    const doc = await (await discoveryRoute()).json();
    expect(doc.issuer).toBe(ISSUER);
    expect(doc.token_endpoint).toBe(`${ISSUER}/oauth/token`);
    const keys = await (await jwksRoute()).json();
    expect(keys.keys.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(keys)).not.toContain('"d"');
  });
});

describe("authorization endpoint", () => {
  it("sends a signed-out person to Yuyu sign-in and back, and honours prompt=none", async () => {
    const query = authorizeQuery(clients.pg);
    const location = await authorize(query);
    expect(location.startsWith("/login?callbackUrl=")).toBe(true);
    expect(decodeURIComponent(location.slice("/login?callbackUrl=".length))).toBe(`/oauth/authorize?${query.toString()}`);
    const none = new URL(await authorize(authorizeQuery(clients.pg, { prompt: "none", state: "s1" })));
    expect(none.searchParams.get("error")).toBe("login_required");
    expect(none.searchParams.get("state")).toBe("s1");
  });

  it("never redirects to an unregistered client or redirect URI", async () => {
    signIn(users.asha);
    for (const overrides of [
      { client_id: "yyc_AAAAAAAAAAAAAAAAAAAAAA" },
      { redirect_uri: `${REDIRECT}/` },
      { redirect_uri: "https://attacker.example/cb" },
      { redirect_uri: undefined },
    ]) {
      const location = await authorize(authorizeQuery(clients.pg, overrides));
      expect(location.startsWith("/oauth/consent?"), JSON.stringify(overrides)).toBe(true);
    }
    // A repeated parameter is malformed and also stays on Yuyu.
    expect((await authorize(`${authorizeQuery(clients.pg).toString()}&redirect_uri=${encodeURIComponent(REDIRECT)}`)).startsWith("/oauth/consent?")).toBe(true);
    // Disabled clients are unknown.
    await prisma.oAuthClient.update({ where: { id: clients.other.id }, data: { status: "DISABLED" } });
    expect((await authorize(authorizeQuery(clients.other))).startsWith("/oauth/consent?")).toBe(true);
    await prisma.oAuthClient.update({ where: { id: clients.other.id }, data: { status: "ACTIVE" } });
    const approve = await approveOAuthConsent(authorizeQuery(clients.pg, { redirect_uri: "https://attacker.example/cb" }).toString());
    expect(approve.ok).toBe(false);
  });

  it("returns protocol errors to the registered redirect URI, including missing or plain PKCE", async () => {
    signIn(users.asha);
    for (const [overrides, error] of [
      [{ code_challenge: undefined }, "invalid_request"],
      [{ code_challenge_method: "plain", code_challenge: VERIFIER.slice(0, 43) }, "invalid_request"],
      [{ code_challenge_method: undefined }, "invalid_request"],
      [{ nonce: undefined }, "invalid_request"],
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ scope: "openid email" }, "invalid_scope"],
      [{ scope: "profile" }, "invalid_scope"],
    ] as const) {
      const url = new URL(await authorize(authorizeQuery(clients.pg, { ...overrides, state: "keep" })));
      expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
      expect(url.searchParams.get("error"), JSON.stringify(overrides)).toBe(error);
      expect(url.searchParams.get("state")).toBe("keep");
      expect(url.searchParams.get("code")).toBeNull();
    }
    // A scope the client was not registered for.
    const url = new URL(await authorize(authorizeQuery(clients.pub, { scope: "openid yuyu.events" })));
    expect(url.searchParams.get("error")).toBe("invalid_scope");
  });

  it("asks once, then skips the authorisation screen; Cancel stores nothing", async () => {
    signIn(users.ravi);
    const query = authorizeQuery(clients.pg);
    expect((await authorize(query)).startsWith("/oauth/consent?")).toBe(true);
    const none = new URL(await authorize(authorizeQuery(clients.pg, { prompt: "none" })));
    expect(none.searchParams.get("error")).toBe("consent_required");

    const denied = await denyOAuthConsent(query.toString());
    expect(denied.ok && new URL(denied.data!.redirectTo).searchParams.get("error")).toBe("access_denied");
    expect(await prisma.oAuthGrant.count({ where: { userId: users.ravi } })).toBe(0);

    const approved = await approveOAuthConsent(query.toString());
    expect(approved.ok).toBe(true);
    const grant = await prisma.oAuthGrant.findUniqueOrThrow({ where: { userId_clientId: { userId: users.ravi, clientId: clients.pg.id } } });
    expect(grant.scopes).toEqual(["openid", "profile", "yuyu.events"]);
    expect(await prisma.auditEvent.count({ where: { action: "OAUTH_GRANT_APPROVED", actorUserId: users.ravi } })).toBe(1);

    const second = new URL(await authorize(authorizeQuery(clients.pg)));
    expect(second.searchParams.get("code")).toMatch(/^yoc_/);
    // prompt=consent forces the screen again.
    expect((await authorize(authorizeQuery(clients.pg, { prompt: "consent" }))).startsWith("/oauth/consent?")).toBe(true);
  });

  it("stores only a 60-second, hashed, PKCE-bound code", async () => {
    const { code } = await obtainCode(clients.pg, users.asha);
    const row = await prisma.oAuthAuthorizationCode.findUniqueOrThrow({ where: { codeHash: sha256Hex(code) } });
    expect(row.codeChallenge).toBe(CHALLENGE);
    expect(row.codeChallengeMethod).toBe("S256");
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(60_000);
    expect(JSON.stringify(row)).not.toContain(code);
    // The database refuses a longer-lived or non-S256 code.
    const base = { clientId: clients.pg.id, userId: users.asha, sessionVersion: 0, redirectUri: REDIRECT, scopes: ["openid"], codeChallenge: CHALLENGE, authTime: new Date() };
    const now = new Date();
    await expect(prisma.oAuthAuthorizationCode.create({ data: { ...base, codeHash: sha256Hex(randomUUID()), createdAt: now, expiresAt: new Date(now.getTime() + 61_000) } })).rejects.toThrow();
    await expect(prisma.oAuthAuthorizationCode.create({ data: { ...base, codeHash: sha256Hex(randomUUID()), codeChallengeMethod: "plain", createdAt: now, expiresAt: new Date(now.getTime() + 30_000) } })).rejects.toThrow();
  });
});

describe("token endpoint", () => {
  it("issues a verifiable ES256 ID token with a pairwise sub and no email", async () => {
    const tokens = await login(clients.pg, users.asha);
    expect(tokens.access_token).toMatch(/^yoa_/);
    expect(tokens.refresh_token).toMatch(/^yor_/);
    expect(tokens.scope).toBe("openid profile yuyu.events");
    const { payload, protectedHeader } = await jwtVerify(tokens.id_token, await jwks(), { issuer: ISSUER, audience: clients.pg.clientId, algorithms: ["ES256"] });
    expect(protectedHeader.alg).toBe("ES256");
    expect(payload.sub).toBe(pairwiseSubject(clients.pg.salt, users.asha));
    expect(payload.sub).not.toContain(users.asha);
    expect(payload.nonce).toBe(tokens.nonce);
    expect(payload.name).toBe("Asha Rao");
    expect(payload.picture).toBe(`${ISSUER}/api/uploads/org/u/asha.webp`);
    expect(typeof payload.auth_time).toBe("number");
    expect(payload.exp! - payload.iat!).toBe(300);
    expect(Object.keys(payload).sort()).toEqual(["aud", "auth_time", "exp", "iat", "iss", "name", "nonce", "picture", "sub"]);
    expect(JSON.stringify(payload)).not.toContain(ashaEmail);
    const session = await prisma.oAuthSession.findFirstOrThrow({ where: { accessTokenHash: sha256Hex(tokens.access_token) } });
    expect(JSON.stringify(session)).not.toContain(tokens.access_token);
    expect(JSON.stringify(session)).not.toContain(tokens.refresh_token);
  });

  it("is no-store and authenticates confidential and public clients strictly", async () => {
    const { code } = await obtainCode(clients.pg, users.asha);
    const wrongSecret = await tokenRoute(form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: VERIFIER }, { basic: [clients.pg.clientId, `yys_${"x".repeat(43)}`] }));
    expect(wrongSecret.status).toBe(401);
    expect(wrongSecret.headers.get("www-authenticate")).toContain("Basic");
    expect((await wrongSecret.json()).error).toBe("invalid_client");
    const noSecret = await tokenRoute(form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: VERIFIER, client_id: clients.pg.clientId }));
    expect(noSecret.status).toBe(401);
    const otherClient = await exchange(clients.other, code);
    expect(otherClient.body.error).toBe("invalid_grant");
    const both = await tokenRoute(form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: VERIFIER, client_secret: clients.pg.secret! }, { basic: [clients.pg.clientId, clients.pg.secret!] }));
    expect(both.status).toBe(401);
    const json = await tokenRoute(new Request(`${ISSUER}/oauth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect((await json.json()).error).toBe("invalid_request");
    const ok = await exchange(clients.pg, code);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.headers.get("pragma")).toBe("no-cache");

    // client_secret_post works too.
    const second = await obtainCode(clients.pg, users.asha);
    const post = await tokenRoute(form({ grant_type: "authorization_code", code: second.code, redirect_uri: REDIRECT, code_verifier: VERIFIER, client_id: clients.pg.clientId, client_secret: clients.pg.secret! }));
    expect(post.status).toBe(200);

    // Public client: client_id only, PKCE carries the proof; a secret is refused.
    const pub = await obtainCode(clients.pub, users.asha, { scope: "openid profile" });
    const withSecret = await tokenRoute(form({ grant_type: "authorization_code", code: pub.code, redirect_uri: REDIRECT, code_verifier: VERIFIER, client_id: clients.pub.clientId, client_secret: `yys_${"x".repeat(43)}` }));
    expect(withSecret.status).toBe(401);
    expect((await exchangePublic(clients.pub, pub.code)).status).toBe(200);
  });

  it("requires the exact redirect URI and the PKCE verifier", async () => {
    const { code } = await obtainCode(clients.pg, users.asha);
    expect((await exchange(clients.pg, code, { redirect_uri: `${REDIRECT}/` })).body.error).toBe("invalid_grant");
    expect((await exchange(clients.pg, code, { code_verifier: `${VERIFIER}x` })).body.error).toBe("invalid_grant");
    const missing = await tokenRoute(form({ grant_type: "authorization_code", code, redirect_uri: REDIRECT }, { basic: [clients.pg.clientId, clients.pg.secret!] }));
    expect((await missing.json()).error).toBe("invalid_request");
    // Failed attempts do not burn the code for the real client.
    expect((await exchange(clients.pg, code)).status).toBe(200);
  });

  it("codes are single use: a replay fails and revokes what the code issued", async () => {
    const tokens = await login(clients.pg, users.asha);
    expect((await userinfo(tokens.access_token)).status).toBe(200);
    const replay = await exchange(clients.pg, tokens.code);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
    expect((await userinfo(tokens.access_token)).status).toBe(401);
    expect((await refresh(clients.pg, tokens.refresh_token)).body.error).toBe("invalid_grant");
    expect(await prisma.auditEvent.count({ where: { action: "OAUTH_CODE_REUSED", actorUserId: users.asha } })).toBeGreaterThanOrEqual(1);
  });

  it("two concurrent redemptions of one code yield exactly one token set", async () => {
    const { code } = await obtainCode(clients.pg, users.asha);
    const results = await Promise.all([exchange(clients.pg, code), exchange(clients.pg, code)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
  });

  it("expired codes are refused", async () => {
    const { code } = await obtainCode(clients.pg, users.asha);
    const past = new Date(Date.now() - 120_000);
    await prisma.oAuthAuthorizationCode.update({ where: { codeHash: sha256Hex(code) }, data: { createdAt: past, expiresAt: new Date(past.getTime() + 60_000) } });
    const result = await exchange(clients.pg, code);
    expect(result.body.error).toBe("invalid_grant");
  });

  it("refresh tokens rotate; a late replay revokes the session, a quick retry does not", async () => {
    const tokens = await login(clients.pg, users.asha);
    const first = await refresh(clients.pg, tokens.refresh_token);
    expect(first.status).toBe(200);
    expect(first.body.refresh_token).not.toBe(tokens.refresh_token);
    const { payload } = await jwtVerify(first.body.id_token, await jwks(), { issuer: ISSUER, audience: clients.pg.clientId });
    expect(payload.sub).toBe(pairwiseSubject(clients.pg.salt, users.asha));
    expect(payload.nonce).toBeUndefined();
    expect((await userinfo(tokens.access_token)).status).toBe(401);
    expect((await userinfo(first.body.access_token)).status).toBe(200);

    // A retry with the old token inside the grace window is refused without revoking.
    expect((await refresh(clients.pg, tokens.refresh_token)).body.error).toBe("invalid_grant");
    expect((await userinfo(first.body.access_token)).status).toBe(200);
    // Another client may not use it.
    const foreign = await tokenRoute(form({ grant_type: "refresh_token", refresh_token: first.body.refresh_token }, { basic: [clients.other.clientId, clients.other.secret!] }));
    expect((await foreign.json()).error).toBe("invalid_grant");
    // Scope may narrow, never widen.
    const widen = await tokenRoute(form({ grant_type: "refresh_token", refresh_token: first.body.refresh_token, scope: "openid profile yuyu.events" }, { basic: [clients.pg.clientId, clients.pg.secret!] }));
    expect(widen.status).toBe(200);
    const narrowed = await widen.json();
    const narrow = await tokenRoute(form({ grant_type: "refresh_token", refresh_token: narrowed.refresh_token, scope: "openid" }, { basic: [clients.pg.clientId, clients.pg.secret!] }));
    const narrowBody = await narrow.json();
    expect(narrowBody.scope).toBe("openid");
    expect((await userinfo(narrowBody.access_token)).body).toEqual({ sub: pairwiseSubject(clients.pg.salt, users.asha) });
    const widenAgain = await tokenRoute(form({ grant_type: "refresh_token", refresh_token: narrowBody.refresh_token, scope: "openid profile" }, { basic: [clients.pg.clientId, clients.pg.secret!] }));
    expect((await widenAgain.json()).error).toBe("invalid_scope");

    // After the grace window the replay is theft: the session ends.
    await prisma.oAuthSession.updateMany({ where: { refreshTokenHash: sha256Hex(narrowBody.refresh_token) }, data: { rotatedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1_000) } });
    expect((await refresh(clients.pg, narrowed.refresh_token)).body.error).toBe("invalid_grant");
    expect((await refresh(clients.pg, narrowBody.refresh_token)).body.error).toBe("invalid_grant");
    expect((await userinfo(narrowBody.access_token)).status).toBe(401);
    expect(await prisma.auditEvent.count({ where: { action: "OAUTH_REFRESH_TOKEN_REUSED", actorUserId: users.asha } })).toBeGreaterThanOrEqual(1);
  });

  it("refuses unsupported grant types, and client_credentials without a machine scope", async () => {
    const password = await tokenRoute(form({ grant_type: "password", username: "a", password: "b" }, { basic: [clients.pg.clientId, clients.pg.secret!] }));
    expect((await password.json()).error).toBe("unsupported_grant_type");
    // client_credentials exists for the People's Gallery integration (docs/PG_INTEGRATION.md),
    // but only for first-party confidential clients holding `yuyu.integration`.
    const response = await tokenRoute(form({ grant_type: "client_credentials" }, { basic: [clients.pg.clientId, clients.pg.secret!] }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("unauthorized_client");
  });
});

describe("userinfo and pairwise subjects", () => {
  it("returns only sub, name and picture, stable per client and different across clients", async () => {
    const a1 = await login(clients.pg, users.asha);
    const a2 = await login(clients.pg, users.asha);
    const other = await login(clients.other, users.asha);
    const ravi = await login(clients.pg, users.ravi);
    const info = await userinfo(a1.access_token);
    expect(info.headers.get("cache-control")).toBe("no-store");
    expect(info.body).toEqual({ sub: pairwiseSubject(clients.pg.salt, users.asha), name: "Asha Rao", picture: `${ISSUER}/api/uploads/org/u/asha.webp` });
    expect(JSON.stringify(info.body)).not.toMatch(/email|@example\.test/);
    expect((await userinfo(a2.access_token)).body.sub).toBe(info.body.sub);
    const otherSub = (await userinfo(other.access_token)).body.sub;
    expect(otherSub).not.toBe(info.body.sub);
    expect(otherSub).toBe(decodeJwt(other.id_token).sub);
    expect((await userinfo(ravi.access_token)).body.sub).not.toBe(info.body.sub);
    const post = await userinfoPost(new Request(`${ISSUER}/oauth/userinfo`, { method: "POST", headers: { authorization: `Bearer ${a1.access_token}` } }));
    expect(post.status).toBe(200);
  });

  it("refuses missing, malformed, query-string and refresh tokens", async () => {
    const tokens = await login(clients.pg, users.asha);
    expect((await userinfoRoute(new Request(`${ISSUER}/oauth/userinfo`))).status).toBe(401);
    expect((await userinfo("yoa_short")).status).toBe(401);
    expect((await userinfo(tokens.refresh_token)).status).toBe(401);
    expect((await userinfoRoute(new Request(`${ISSUER}/oauth/userinfo?access_token=${tokens.access_token}`))).status).toBe(400);
    await prisma.oAuthSession.updateMany({ where: { accessTokenHash: sha256Hex(tokens.access_token) }, data: { accessExpiresAt: new Date(Date.now() - 1) } });
    expect((await userinfo(tokens.access_token)).status).toBe(401);
  });
});

describe("revocation", () => {
  it("RFC 7009: a client revokes its own token; others' and unknown tokens change nothing", async () => {
    const tokens = await login(clients.pg, users.asha);
    const revokeAs = (client: Client, token: string) => revokeRoute(form({ token }, { basic: [client.clientId, client.secret!] }));
    expect((await revokeAs(clients.other, tokens.refresh_token)).status).toBe(200);
    expect((await userinfo(tokens.access_token)).status).toBe(200);
    expect((await revokeAs(clients.pg, `yor_${"z".repeat(43)}`)).status).toBe(200);
    expect((await revokeAs(clients.pg, tokens.refresh_token)).status).toBe(200);
    expect((await userinfo(tokens.access_token)).status).toBe(401);
    expect((await refresh(clients.pg, tokens.refresh_token)).body.error).toBe("invalid_grant");
    const unauthenticated = await revokeRoute(form({ token: tokens.access_token, client_id: clients.pg.clientId }));
    expect(unauthenticated.status).toBe(401);
  });

  it("a password reset revokes every token, and a code issued before it", async () => {
    const tokens = await login(clients.pg, users.asha);
    const other = await login(clients.other, users.asha);
    const pending = await obtainCode(clients.pg, users.asha);
    const rawToken = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    await prisma.verificationToken.create({ data: { identifier: `reset:${ashaEmail}`, token: sha256Hex(rawToken), expires: new Date(Date.now() + 60_000) } });
    const reset = await confirmPasswordReset({ email: ashaEmail, token: rawToken, password: "a brand new passphrase 42" });
    expect(reset.ok).toBe(true);

    expect((await userinfo(tokens.access_token)).status).toBe(401);
    expect((await userinfo(other.access_token)).status).toBe(401);
    expect((await refresh(clients.pg, tokens.refresh_token)).body.error).toBe("invalid_grant");
    expect((await exchange(clients.pg, pending.code)).body.error).toBe("invalid_grant");
    expect(await prisma.oAuthSession.count({ where: { userId: users.asha, revokedAt: null } })).toBe(0);
    // The grant stays: signing in again does not ask for consent a second time.
    signIn(users.asha);
    expect(new URL(await authorize(authorizeQuery(clients.pg))).searchParams.get("code")).toMatch(/^yoc_/);
  });

  it("sign out everywhere revokes OAuth sessions too", async () => {
    const tokens = await login(clients.pg, users.ravi);
    await revokeAllSessionsForUser(users.ravi);
    expect((await userinfo(tokens.access_token)).status).toBe(401);
    expect((await refresh(clients.pg, tokens.refresh_token)).body.error).toBe("invalid_grant");
    expect(await prisma.oAuthSession.count({ where: { userId: users.ravi, revokedAt: null } })).toBe(0);
  });

  it("disconnecting the app revokes its sessions and brings back the authorisation screen", async () => {
    const tokens = await login(clients.other, users.ravi);
    const grant = await prisma.oAuthGrant.findUniqueOrThrow({ where: { userId_clientId: { userId: users.ravi, clientId: clients.other.id } } });
    signIn(users.asha);
    expect((await disconnectOAuthApp({ grantId: grant.id })).ok).toBe(false);
    signIn(users.ravi);
    expect((await disconnectOAuthApp({ grantId: grant.id })).ok).toBe(true);
    expect((await userinfo(tokens.access_token)).status).toBe(401);
    expect((await refresh(clients.other, tokens.refresh_token)).body.error).toBe("invalid_grant");
    expect((await authorize(authorizeQuery(clients.other))).startsWith("/oauth/consent?")).toBe(true);
  });

  it("disabling a client stops its tokens", async () => {
    const tokens = await login(clients.pg, users.ravi);
    await prisma.oAuthClient.update({ where: { id: clients.pg.id }, data: { status: "DISABLED" } });
    try {
      expect((await userinfo(tokens.access_token)).status).toBe(401);
      const refreshed = await tokenRoute(form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }, { basic: [clients.pg.clientId, clients.pg.secret!] }));
      expect(refreshed.status).toBe(401);
    } finally {
      await prisma.oAuthClient.update({ where: { id: clients.pg.id }, data: { status: "ACTIVE" } });
    }
  });
});
