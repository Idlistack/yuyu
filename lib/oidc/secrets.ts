import "server-only";

import crypto from "node:crypto";

/*
 * At-rest encryption for OIDC provider material: ID-token signing private
 * keys and per-client pairwise salts. AES-256-GCM under its own HKDF label of
 * MFA_ENCRYPTION_KEY, the same construction as instance settings and webhook
 * secrets (lib/instanceConfigSecrets.ts, lib/webhooks/secrets.ts), so the
 * ciphertext is never interchangeable with theirs.
 * scripts/oauth-register-client.ts and scripts/check-instance-secrets.mjs
 * repeat this derivation; tests/unit/oidc-provider.test.ts pins them together.
 */

export const OIDC_SECRET_HKDF_LABEL = "yuyu-oidc-provider-secrets-v1";

export class OidcSecretUnreadableError extends Error {
  override name = "OidcSecretUnreadableError";
  code = "ESECRETUNREADABLE";

  constructor() {
    super("OIDC provider key material cannot be decrypted with this MFA_ENCRYPTION_KEY; restore the key that encrypted it.");
  }
}

function encryptionKey() {
  const raw = process.env.MFA_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    throw new Error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  }
  return Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), OIDC_SECRET_HKDF_LABEL, 32));
}

export function encryptOidcSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptOidcSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new OidcSecretUnreadableError();
  const key = encryptionKey();
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new OidcSecretUnreadableError();
  }
}
