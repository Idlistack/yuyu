import "server-only";

import { Prisma } from "@prisma/client";
import { calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, type CryptoKey, type JWK } from "jose";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { ID_TOKEN_ALG, RETIRED_KEY_PUBLISH_MS } from "@/lib/oidc/config";
import { decryptOidcSecret, encryptOidcSecret } from "@/lib/oidc/secrets";

/*
 * ID-token signing keys. One key is active (a partial unique index enforces
 * it); rotation retires it and creates the next in one transaction. A retired
 * key stays in the JWKS for RETIRED_KEY_PUBLISH_MS so tokens it signed and
 * cached JWKS documents keep verifying. Private keys are encrypted at rest and
 * never leave this module.
 */

export type ActiveSigningKey = { kid: string; alg: typeof ID_TOKEN_ALG; privateKey: CryptoKey };

const cacheKey = Symbol.for("yuyu.oidc.signingKeyCache");
type Cache = Map<string, CryptoKey>;
function keyCache(): Cache {
  const store = globalThis as typeof globalThis & { [cacheKey]?: Cache };
  store[cacheKey] ??= new Map();
  return store[cacheKey];
}

/** Public JWK fields only; anything private is dropped even if present. */
export function toPublicJwk(jwk: JWK, kid: string): JWK {
  const { kty, crv, x, y, n, e } = jwk;
  return Object.fromEntries(
    Object.entries({ kty, crv, x, y, n, e, kid, alg: ID_TOKEN_ALG, use: "sig" }).filter(([, value]) => value !== undefined),
  ) as JWK;
}

async function newKeyMaterial() {
  const { publicKey, privateKey } = await generateKeyPair(ID_TOKEN_ALG, { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  const kid = await calculateJwkThumbprint(publicJwk);
  return {
    kid,
    alg: ID_TOKEN_ALG,
    publicJwk: toPublicJwk(publicJwk, kid) as Prisma.InputJsonValue,
    privateJwkEncrypted: encryptOidcSecret(JSON.stringify(privateJwk)),
  };
}

async function importPrivate(kid: string, encrypted: string) {
  const cached = keyCache().get(kid);
  if (cached) return cached;
  const jwk = JSON.parse(decryptOidcSecret(encrypted)) as JWK;
  const key = (await importJWK(jwk, ID_TOKEN_ALG)) as CryptoKey;
  keyCache().set(kid, key);
  return key;
}

/** The active signing key, created on first use. Safe across replicas. */
export async function getActiveSigningKey(): Promise<ActiveSigningKey> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const active = await prisma.oAuthSigningKey.findFirst({
      where: { retiredAt: null },
      select: { kid: true, alg: true, privateJwkEncrypted: true },
    });
    if (active) return { kid: active.kid, alg: ID_TOKEN_ALG, privateKey: await importPrivate(active.kid, active.privateJwkEncrypted) };
    try {
      const material = await newKeyMaterial();
      await prisma.$transaction(async (tx) => {
        await tx.oAuthSigningKey.create({ data: material });
        await recordAuditEvent({ action: "OAUTH_SIGNING_KEY_CREATED", targetType: "OAuthSigningKey", targetId: material.kid, client: tx });
      });
    } catch (error) {
      // Another replica created the first key at the same moment; read theirs.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  throw new Error("No active OIDC signing key.");
}

/**
 * Retire the active key (kept in the JWKS for a grace period) and activate a
 * new one. Used by scripts/oauth-register-client.ts `rotate-key`.
 */
export async function rotateSigningKey(now = new Date()) {
  const material = await newKeyMaterial();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE "OAuthSigningKey" IN SHARE ROW EXCLUSIVE MODE`;
    const retired = await tx.oAuthSigningKey.updateMany({
      where: { retiredAt: null },
      data: { retiredAt: now, expiresAt: new Date(now.getTime() + RETIRED_KEY_PUBLISH_MS) },
    });
    await tx.oAuthSigningKey.create({ data: material });
    await recordAuditEvent({
      action: "OAUTH_SIGNING_KEY_ROTATED",
      targetType: "OAuthSigningKey",
      targetId: material.kid,
      metadata: { retiredKeys: retired.count },
      client: tx,
    });
    return { kid: material.kid };
  });
}

/** Public keys relying parties may verify with: the active key and unexpired retired keys. */
export async function publishedJwks(now = new Date()): Promise<{ keys: JWK[] }> {
  const rows = await prisma.oAuthSigningKey.findMany({
    where: { OR: [{ retiredAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
    select: { kid: true, publicJwk: true },
  });
  return { keys: rows.map((row) => toPublicJwk(row.publicJwk as JWK, row.kid)) };
}
