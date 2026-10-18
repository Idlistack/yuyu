import { beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/instanceSettings", () => ({ getGoogleSsoSettings: vi.fn(), isNewUserRegistrationEnabled: vi.fn() }));

import { mobileGoogleClientIds, verifyGoogleIdToken } from "@/lib/googleSignIn";

const AUDIENCE = "web-client.apps.googleusercontent.com";
let keySet: JWTVerifyGetKey;
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;

async function token(claims: Record<string, unknown>, options: { key?: CryptoKey; issuer?: string; audience?: string; expiresIn?: string | number; alg?: string } = {}) {
  const jwt = new SignJWT({ email: "ada@example.test", email_verified: true, name: "Ada", ...claims })
    .setProtectedHeader({ alg: options.alg ?? "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? "https://accounts.google.com")
    .setAudience(options.audience ?? AUDIENCE)
    .setSubject("google-sub-1")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m");
  return jwt.sign(options.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  keySet = createLocalJWKSet({ keys: [jwk] });
});

describe("Google ID-token verification", () => {
  it("accepts a valid token for a configured audience", async () => {
    await expect(verifyGoogleIdToken(await token({}), [AUDIENCE], keySet)).resolves.toEqual({ sub: "google-sub-1", email: "ada@example.test", name: "Ada", picture: null });
    await expect(verifyGoogleIdToken(await token({}, { issuer: "accounts.google.com" }), [AUDIENCE], keySet)).resolves.not.toBeNull();
  });

  it("rejects a bad signature, issuer, audience, expiry or unverified email", async () => {
    await expect(verifyGoogleIdToken(await token({}, { key: otherPrivateKey }), [AUDIENCE], keySet)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await token({}, { issuer: "https://evil.example" }), [AUDIENCE], keySet)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await token({}, { audience: "someone-else" }), [AUDIENCE], keySet)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await token({}, { expiresIn: Math.floor(Date.now() / 1000) - 3600 }), [AUDIENCE], keySet)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await token({ email_verified: false }), [AUDIENCE], keySet)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await token({ email_verified: "true" }), [AUDIENCE], keySet)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await token({ email: undefined }), [AUDIENCE], keySet)).resolves.toBeNull();
    await expect(verifyGoogleIdToken("not.a.jwt", [AUDIENCE], keySet)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await token({}), [], keySet)).resolves.toBeNull();
  });

  it("parses the extra mobile client ids", () => {
    expect(mobileGoogleClientIds(" a.apps , ,b.apps ")).toEqual(["a.apps", "b.apps"]);
    expect(mobileGoogleClientIds(undefined)).toEqual([]);
  });
});
