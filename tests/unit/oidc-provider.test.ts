import crypto from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, decodeJwt, jwtVerify, SignJWT } from "jose";

/*
 * Unit coverage for the OIDC provider (docs/OIDC_PROVIDER.md): PKCE S256,
 * redirect URI rules, pairwise subjects, scopes, client authentication
 * parsing, the at-rest encryption shared with the CLI, signing-key rotation
 * against the published JWKS, forbidden claims, and revocation wiring.
 * The full code flow against PostgreSQL is tests/integration/oidc-provider.db.test.ts.
 */

const store = vi.hoisted(() => ({ keys: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/db", () => {
  type Row = { id: string; kid: string; alg: string; publicJwk: unknown; privateJwkEncrypted: string; createdAt: Date; retiredAt: Date | null; expiresAt: Date | null };
  const rows = () => store.keys as Row[];
  const matches = (row: Row, where: Record<string, unknown> = {}) => {
    if ("retiredAt" in where && where.retiredAt === null && row.retiredAt !== null) return false;
    const or = where.OR as Array<Record<string, unknown>> | undefined;
    if (or) {
      return or.some((clause) => ("retiredAt" in clause ? row.retiredAt === null : row.expiresAt !== null && row.expiresAt > ((clause.expiresAt as { gt: Date }).gt)));
    }
    return true;
  };
  const oAuthSigningKey = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => rows().find((row) => matches(row, where)) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) => rows().filter((row) => matches(row, where)).reverse(),
    create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "retiredAt" | "expiresAt"> }) => {
      const row = { ...data, id: crypto.randomUUID(), createdAt: new Date(), retiredAt: null, expiresAt: null };
      store.keys.push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const hit = rows().filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
  };
  const client = { oAuthSigningKey, $executeRaw: async () => 0 };
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof client) => unknown) => fn(client) } };
});

process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

import {
  consentLines, oidcIssuer, parseScopes, scopesCovered, OIDC_SCOPES, AUTHORIZATION_CODE_TTL_MS, ID_TOKEN_TTL_SECONDS,
} from "@/lib/oidc/config";
import {
  CLIENT_ID_PATTERN, CODE_PATTERN, digestsEqual, generateAccessToken, generateAuthorizationCode, generateClientId,
  generateClientSecret, generatePairwiseSalt, generateRefreshToken, isRegistrableRedirectUri, pairwiseSubject,
  parseBasicClientAuth, parseOAuthBearer, pkceChallengeFor, redirectUriMatches, sha256Hex, verifyPkce,
} from "@/lib/oidc/primitives";
import { decryptOidcSecret, encryptOidcSecret, OIDC_SECRET_HKDF_LABEL } from "@/lib/oidc/secrets";
import { ID_TOKEN_CLAIMS, authorizeRequestSchema, tokenResponseSchema, userInfoSchema } from "@/lib/oidc/dto";
import { discoveryDocument } from "@/lib/oidc/discovery";
import { getActiveSigningKey, publishedJwks, rotateSigningKey, toPublicJwk } from "@/lib/oidc/keys";
import { pictureUrl, profileClaims } from "@/lib/oidc/provider";
import * as cli from "@/scripts/oauth-register-client";
import { SECURITY_ACTIVITY_LABELS } from "@/lib/accountSecurity";

describe("PKCE S256", () => {
  // RFC 7636 Appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("matches the RFC 7636 test vector", () => {
    expect(pkceChallengeFor(verifier)).toBe(challenge);
    expect(verifyPkce(verifier, challenge, "S256")).toBe(true);
  });

  it("refuses plain, a wrong verifier and malformed values", () => {
    expect(verifyPkce(verifier, verifier, "plain")).toBe(false);
    expect(verifyPkce(verifier, challenge, "plain")).toBe(false);
    expect(verifyPkce(`${verifier}x`, challenge, "S256")).toBe(false);
    expect(verifyPkce("short", pkceChallengeFor("short"), "S256")).toBe(false);
    expect(verifyPkce("a".repeat(129), pkceChallengeFor("a".repeat(129)), "S256")).toBe(false);
    expect(verifyPkce(`${"a".repeat(42)} `, challenge, "S256")).toBe(false);
    expect(verifyPkce(verifier, `${challenge}=`, "S256")).toBe(false);
  });

  it("accepts every unreserved character at the length bounds", () => {
    for (const value of ["a".repeat(43), `${"A-._~0z".repeat(18)}AB`]) {
      expect(verifyPkce(value, pkceChallengeFor(value), "S256")).toBe(true);
    }
  });

  it("the authorize schema requires an S256 challenge, state and nonce", () => {
    const base = {
      response_type: "code", client_id: generateClientId(), redirect_uri: "https://pg.test/cb", scope: "openid",
      state: "s", nonce: "n", code_challenge: challenge, code_challenge_method: "S256",
    };
    expect(authorizeRequestSchema.safeParse(base).success).toBe(true);
    for (const broken of [
      { code_challenge_method: "plain" }, { code_challenge_method: undefined }, { code_challenge: undefined },
      { code_challenge: "short" }, { state: undefined }, { nonce: undefined }, { response_type: "token" },
      { prompt: "login" }, { state: "line\nbreak" },
    ]) {
      expect(authorizeRequestSchema.safeParse({ ...base, ...broken }).success, JSON.stringify(broken)).toBe(false);
    }
  });
});

describe("redirect URIs", () => {
  it("match exactly: no prefix, case, slash, query or port leniency", () => {
    const registered = ["http://localhost:8080/api/v2/auth/yuyu/callback"];
    expect(redirectUriMatches("http://localhost:8080/api/v2/auth/yuyu/callback", registered)).toBe(true);
    for (const variant of [
      "http://localhost:8080/api/v2/auth/yuyu/callback/",
      "http://localhost:8080/api/v2/auth/yuyu/callback?x=1",
      "http://localhost:8080/api/v2/auth/yuyu/callbackx",
      "http://localhost:8080/api/v2/auth/yuyu",
      "http://LOCALHOST:8080/api/v2/auth/yuyu/callback",
      "http://localhost:8081/api/v2/auth/yuyu/callback",
      "https://localhost:8080/api/v2/auth/yuyu/callback",
      "http://localhost:8080/api/v2/auth/yuyu/callback#frag",
      "http://localhost:8080/api/v2/auth/yuyu/%63allback",
      "",
    ]) {
      expect(redirectUriMatches(variant, registered), variant).toBe(false);
    }
  });

  it("registration allows https, and http only for loopback, without fragments or credentials", () => {
    expect(isRegistrableRedirectUri("https://photos.example.org/api/v2/auth/yuyu/callback")).toBe(true);
    expect(isRegistrableRedirectUri("http://localhost:8080/api/v2/auth/yuyu/callback")).toBe(true);
    expect(isRegistrableRedirectUri("http://127.0.0.1:8080/cb")).toBe(true);
    for (const bad of [
      "http://photos.example.org/cb", "https://photos.example.org/cb#x", "https://user:pw@photos.example.org/cb",
      "javascript:alert(1)", "/relative", " https://photos.example.org/cb", "custom://cb", `https://x.test/${"a".repeat(2000)}`,
    ]) {
      expect(isRegistrableRedirectUri(bad), bad).toBe(false);
      expect(cli.isRegistrableRedirectUri(bad), bad).toBe(false);
    }
  });
});

describe("pairwise subject", () => {
  it("is stable for one client and user, and unrelated across clients and users", () => {
    const saltA = generatePairwiseSalt();
    const saltB = generatePairwiseSalt();
    const sub = pairwiseSubject(saltA, "user_1");
    expect(sub).toBe(pairwiseSubject(saltA, "user_1"));
    expect(sub).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sub).not.toContain("user_1");
    expect(pairwiseSubject(saltB, "user_1")).not.toBe(sub);
    expect(pairwiseSubject(saltA, "user_2")).not.toBe(sub);
  });

  it("pins the derivation so subjects never change across releases", () => {
    const salt = Buffer.alloc(32, 1).toString("base64url");
    const expected = crypto.createHmac("sha256", Buffer.alloc(32, 1)).update("yuyu-oidc-sub-v1|cuid_abc").digest("base64url");
    expect(pairwiseSubject(salt, "cuid_abc")).toBe(expected);
  });
});

describe("scopes and consent copy", () => {
  it("accepts only known, unique scopes that include openid", () => {
    expect(parseScopes("openid profile yuyu.events")).toEqual(["openid", "profile", "yuyu.events"]);
    expect(parseScopes("yuyu.events openid")).toEqual(["openid", "yuyu.events"]);
    for (const bad of ["", "profile", "openid email", "openid openid", "openid  offline_access", null]) {
      expect(parseScopes(bad), String(bad)).toBeNull();
    }
    expect(scopesCovered(["openid", "profile"], ["openid", "profile", "yuyu.events"])).toBe(true);
    expect(scopesCovered(["openid", "yuyu.events"], ["openid", "profile"])).toBe(false);
  });

  it("shows exactly the two People's Gallery lines", () => {
    expect(consentLines(["openid", "profile", "yuyu.events"])).toEqual(["Know who you are", "See events you’re part of"]);
    expect(cli.KNOWN_SCOPES).toEqual(OIDC_SCOPES);
  });

  it("lists the grant actions in the person's own security activity", () => {
    expect(SECURITY_ACTIVITY_LABELS).toHaveProperty("OAUTH_GRANT_APPROVED");
    expect(SECURITY_ACTIVITY_LABELS).toHaveProperty("OAUTH_GRANT_REVOKED");
  });
});

describe("credentials", () => {
  it("are prefixed, high-entropy and stored only as digests", () => {
    expect(generateClientId()).toMatch(CLIENT_ID_PATTERN);
    expect(generateClientSecret()).toMatch(/^yys_[A-Za-z0-9_-]{43}$/);
    expect(generateAuthorizationCode()).toMatch(CODE_PATTERN);
    expect(generateAccessToken()).toMatch(/^yoa_/);
    expect(generateRefreshToken()).toMatch(/^yor_/);
    expect(new Set(Array.from({ length: 50 }, generateAuthorizationCode)).size).toBe(50);
    const secret = generateClientSecret();
    expect(digestsEqual(sha256Hex(secret), sha256Hex(secret))).toBe(true);
    expect(digestsEqual(sha256Hex(secret), sha256Hex(`${secret}x`))).toBe(false);
    expect(digestsEqual("zz", sha256Hex(secret))).toBe(false);
  });

  it("parses client_secret_basic with form-encoded parts and bearer tokens strictly", () => {
    const basic = `Basic ${Buffer.from("yyc_abc:se%3Acret").toString("base64")}`;
    expect(parseBasicClientAuth(basic)).toEqual({ clientId: "yyc_abc", clientSecret: "se:cret" });
    expect(parseBasicClientAuth("Basic !!!")).toBeNull();
    expect(parseBasicClientAuth(`Basic ${Buffer.from("nocolon").toString("base64")}`)).toBeNull();
    expect(parseBasicClientAuth(`Bearer ${generateAccessToken()}`)).toBeNull();
    const access = generateAccessToken();
    expect(parseOAuthBearer(`Bearer ${access}`)).toBe(access);
    expect(parseOAuthBearer(`Bearer ${generateRefreshToken()}`)).toBeNull();
    expect(parseOAuthBearer(`Bearer yma_${"a".repeat(43)}`)).toBeNull();
  });
});

describe("at-rest encryption", () => {
  it("round-trips and is domain separated from instance settings and webhook secrets", () => {
    const sealed = encryptOidcSecret("salt-value");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("salt-value");
    expect(decryptOidcSecret(sealed)).toBe("salt-value");
    expect(OIDC_SECRET_HKDF_LABEL).toBe(cli.OIDC_SECRET_HKDF_LABEL);
    expect(OIDC_SECRET_HKDF_LABEL).not.toMatch(/instance-service-settings|webhook/);
    const [version, iv, tag, body] = sealed.split(".");
    const flipped = Buffer.from(tag, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decryptOidcSecret([version, iv, flipped.toString("base64url"), body].join("."))).toThrow(/cannot be decrypted/);
  });

  it("the CLI encrypts exactly like the application", () => {
    const fromCli = cli.encryptOidcSecret("pairwise-salt", process.env.MFA_ENCRYPTION_KEY);
    expect(decryptOidcSecret(fromCli)).toBe("pairwise-salt");
    expect(() => cli.encryptOidcSecret("x", "not-a-key")).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it("the CLI builds a client with a hashed secret and an encrypted salt", () => {
    const args = cli.registerArgsSchema.parse({
      name: "People's Gallery",
      redirectUris: ["http://localhost:8080/api/v2/auth/yuyu/callback"],
      scopes: "openid profile yuyu.events",
      firstParty: true,
    });
    const { clientSecret, data } = cli.buildClient(args, process.env.MFA_ENCRYPTION_KEY);
    expect(data.clientId).toMatch(CLIENT_ID_PATTERN);
    expect(clientSecret).toMatch(/^yys_/);
    expect(data.secretHash).toBe(sha256Hex(clientSecret!));
    expect(JSON.stringify(data)).not.toContain(clientSecret!);
    expect(decryptOidcSecret(data.pairwiseSaltEncrypted)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.allowedScopes).toEqual(["openid", "profile", "yuyu.events"]);
    expect(cli.registerArgsSchema.safeParse({ ...args, scopes: "profile" }).success).toBe(false);
    expect(cli.registerArgsSchema.safeParse({ ...args, scopes: "openid email" }).success).toBe(false);
    expect(cli.registerArgsSchema.safeParse({ ...args, extra: true }).success).toBe(false);
    const pub = cli.buildClient(cli.registerArgsSchema.parse({ ...args, scopes: "openid", public: true }), process.env.MFA_ENCRYPTION_KEY);
    expect(pub.clientSecret).toBeNull();
    expect(pub.data.secretHash).toBeNull();
  });

  it("the CLI flag parser collects repeated redirect URIs and refuses stray arguments", () => {
    expect(cli.parseFlags(["--name", "PG", "--redirect-uri", "https://a.test/cb", "--redirect-uri", "https://b.test/cb", "--first-party"]))
      .toEqual({ name: "PG", redirectUris: ["https://a.test/cb", "https://b.test/cb"], firstParty: true });
    expect(() => cli.parseFlags(["stray"])).toThrow(/Unexpected argument/);
    expect(() => cli.parseFlags(["--name"])).toThrow(/Missing value/);
  });
});

describe("ID-token signing keys and JWKS", () => {
  beforeEach(() => {
    store.keys.length = 0;
  });

  async function sign(claims: Record<string, unknown> = {}) {
    const key = await getActiveSigningKey();
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: "JWT" })
      .setIssuer(oidcIssuer()).setAudience("yyc_client").setSubject("sub").setIssuedAt().setExpirationTime("5m")
      .sign(key.privateKey);
    return { token, kid: key.kid };
  }

  it("creates one ES256 key on first use and publishes only public material", async () => {
    const { token, kid } = await sign();
    const again = await getActiveSigningKey();
    expect(again.kid).toBe(kid);
    expect(store.keys).toHaveLength(1);
    const jwks = await publishedJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toEqual({ kty: "EC", crv: "P-256", x: expect.any(String), y: expect.any(String), kid, alg: "ES256", use: "sig" });
    expect(JSON.stringify(jwks)).not.toMatch(/"d"/);
    expect(String(store.keys[0].privateJwkEncrypted)).not.toMatch(/"d"/);
    const verified = await jwtVerify(token, createLocalJWKSet(jwks), { issuer: oidcIssuer(), audience: "yyc_client", algorithms: ["ES256"] });
    expect(verified.protectedHeader.kid).toBe(kid);
  });

  it("rotation keeps the retired key verifying until it expires, then drops it", async () => {
    const old = await sign();
    await rotateSigningKey();
    const fresh = await sign();
    expect(fresh.kid).not.toBe(old.kid);
    const jwks = await publishedJwks();
    expect(jwks.keys.map((key) => key.kid).sort()).toEqual([old.kid, fresh.kid].sort());
    await expect(jwtVerify(old.token, createLocalJWKSet(jwks))).resolves.toBeTruthy();
    await expect(jwtVerify(fresh.token, createLocalJWKSet(jwks))).resolves.toBeTruthy();
    const later = await publishedJwks(new Date(Date.now() + 8 * 24 * 60 * 60_000));
    expect(later.keys.map((key) => key.kid)).toEqual([fresh.kid]);
    await expect(jwtVerify(old.token, createLocalJWKSet(later))).rejects.toThrow();
  });

  it("a token signed by an unknown key or with alg none does not verify", async () => {
    await sign();
    const jwks = createLocalJWKSet(await publishedJwks());
    const { privateKey } = await crypto.webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const forged = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: "forged" }).setIssuer(oidcIssuer()).sign(privateKey);
    await expect(jwtVerify(forged, jwks)).rejects.toThrow();
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from("{}").toString("base64url")}.`;
    await expect(jwtVerify(unsigned, jwks)).rejects.toThrow();
  });

  it("toPublicJwk drops private and unexpected members", () => {
    expect(toPublicJwk({ kty: "EC", crv: "P-256", x: "x", y: "y", d: "secret", ext: true } as never, "k")).toEqual({ kty: "EC", crv: "P-256", x: "x", y: "y", kid: "k", alg: "ES256", use: "sig" });
  });
});

describe("forbidden fields", () => {
  const user = { id: "cuid_user", name: " Asha Rao ", image: null, profileImageUrl: "/api/uploads/u/p.webp", email: "asha@example.test", passwordHash: "$2b$", sessionVersion: 3 };

  it("userinfo and ID-token profile claims never include email or internal fields", () => {
    const claims = profileClaims(user, ["openid", "profile"], "pairwise-sub");
    expect(claims).toEqual({ sub: "pairwise-sub", name: "Asha Rao", picture: `${oidcIssuer()}/api/uploads/u/p.webp` });
    expect(Object.keys(claims).every((key) => (ID_TOKEN_CLAIMS as readonly string[]).includes(key))).toBe(true);
    expect(JSON.stringify(claims)).not.toMatch(/email|cuid_user|passwordHash|sessionVersion/);
    expect(profileClaims(user, ["openid"], "pairwise-sub")).toEqual({ sub: "pairwise-sub" });
    expect(userInfoSchema.safeParse({ sub: "s", email: "a@b.test" }).success).toBe(false);
    expect(userInfoSchema.safeParse({ sub: "s", email_verified: true }).success).toBe(false);
  });

  it("pictures are absolute http(s) URLs and never a Gravatar of the email", () => {
    expect(pictureUrl({ image: "javascript:alert(1)", profileImageUrl: null })).toBeUndefined();
    expect(pictureUrl({ image: "https://lh3.googleusercontent.com/a/x", profileImageUrl: null })).toBe("https://lh3.googleusercontent.com/a/x");
    expect(pictureUrl({ image: null, profileImageUrl: null })).toBeUndefined();
    const source = readFileSync(resolve(import.meta.dirname, "../../lib/oidc/provider.ts"), "utf8");
    expect(source).not.toMatch(/lib\/gravatar/);
    expect(source).not.toMatch(/\bemail\b\s*:/);
  });

  it("the token response DTO is strict", () => {
    const ok = { access_token: "a", token_type: "Bearer", expires_in: 600, refresh_token: "r", id_token: "i", scope: "openid" };
    expect(tokenResponseSchema.safeParse(ok).success).toBe(true);
    expect(tokenResponseSchema.safeParse({ ...ok, email: "a@b.test" }).success).toBe(false);
    expect(tokenResponseSchema.safeParse({ ...ok, user_id: "cuid" }).success).toBe(false);
  });

  it("ID tokens carry only the allowed claims", async () => {
    store.keys.length = 0;
    const key = await getActiveSigningKey();
    // Shape produced by provider.signIdToken.
    const token = await new SignJWT({ auth_time: 1, nonce: "n", ...profileClaims(user, ["openid", "profile"], "s") })
      .setProtectedHeader({ alg: key.alg, kid: key.kid }).setIssuer(oidcIssuer()).setAudience("a").setSubject("s")
      .setIssuedAt().setExpirationTime(`${ID_TOKEN_TTL_SECONDS}s`).sign(key.privateKey);
    for (const claim of Object.keys(decodeJwt(token))) expect(ID_TOKEN_CLAIMS).toContain(claim);
  });
});

describe("discovery", () => {
  it("advertises only what is implemented, from configuration only", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://events.example.test/");
    try {
      const doc = discoveryDocument();
      expect(doc.issuer).toBe("https://events.example.test");
      expect(doc.jwks_uri).toBe("https://events.example.test/oauth/jwks");
      expect(doc.code_challenge_methods_supported).toEqual(["S256"]);
      expect(doc.response_types_supported).toEqual(["code"]);
      expect(doc.subject_types_supported).toEqual(["pairwise"]);
      expect(doc.claims_supported).toEqual([...ID_TOKEN_CLAIMS]);
      expect(JSON.stringify(doc)).not.toMatch(/email|implicit|token id_token|plain/);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(AUTHORIZATION_CODE_TTL_MS).toBeLessThanOrEqual(60_000);
  });
});

describe("revocation wiring", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("every transaction that bumps sessionVersion also revokes OAuth sessions", () => {
    const root = resolve(import.meta.dirname, "../..");
    const bumping = [...sources(join(root, "app")), ...sources(join(root, "lib"))]
      .map((path) => ({ path, text: readFileSync(path, "utf8") }))
      .filter(({ text }) => text.includes("sessionVersion: { increment: 1 }"));
    expect(bumping.length).toBeGreaterThanOrEqual(4);
    for (const { path, text } of bumping) {
      const bumps = text.split("sessionVersion: { increment: 1 }").length - 1;
      const oauth = text.split("revokeUserOAuthSessions(tx,").length - 1;
      expect(oauth, path).toBeGreaterThanOrEqual(bumps);
    }
  });
});
