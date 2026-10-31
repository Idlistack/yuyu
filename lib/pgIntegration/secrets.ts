import "server-only";

import crypto from "node:crypto";

/*
 * At-rest encryption of the People's Gallery integration signing secret
 * (`whsec_…`). AES-256-GCM under its own HKDF label of MFA_ENCRYPTION_KEY, the
 * same construction as organisation webhook secrets (lib/webhooks/secrets.ts),
 * so the ciphertexts are never interchangeable. scripts/pg-integration.ts
 * repeats this derivation; tests/unit/pg-integration.test.ts pins them together.
 */

export const PG_INTEGRATION_SECRET_HKDF_LABEL = "yuyu-pg-integration-signing-secret-v1";

export class PgIntegrationSecretUnreadableError extends Error {
  override name = "PgIntegrationSecretUnreadableError";
  code = "ESECRETUNREADABLE";

  constructor() {
    super("The People's Gallery signing secret cannot be decrypted with this MFA_ENCRYPTION_KEY; rotate it.");
  }
}

function encryptionKey() {
  const raw = process.env.MFA_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    throw new Error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  }
  return Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), PG_INTEGRATION_SECRET_HKDF_LABEL, 32));
}

export function encryptPgIntegrationSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptPgIntegrationSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new PgIntegrationSecretUnreadableError();
  const key = encryptionKey();
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new PgIntegrationSecretUnreadableError();
  }
}
