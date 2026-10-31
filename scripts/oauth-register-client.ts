/**
 * Operator CLI for Yuyu's OpenID Connect provider (docs/OIDC_PROVIDER.md).
 * Run it with exactly the environment the application receives (DATABASE_URL
 * and MFA_ENCRYPTION_KEY), for example inside the migrator image or job:
 *
 *   node --env-file=/secure/yuyu.env scripts/oauth-register-client.ts register \
 *     --name "People's Gallery" \
 *     --redirect-uri https://photos.example.org/api/v2/auth/yuyu/callback \
 *     --scopes "openid profile yuyu.events" --first-party
 *
 *   ... list
 *   ... rotate-secret --client-id yyc_…
 *   ... set-redirect-uris --client-id yyc_… --redirect-uri https://… [--redirect-uri …]
 *   ... disable --client-id yyc_…      (refuses every token and ends its sessions)
 *   ... enable --client-id yyc_…
 *   ... rotate-key                     (new ID-token signing key; the old one stays in the JWKS for 7 days)
 *
 * `register` and `rotate-secret` print the client secret ONCE; only its
 * SHA-256 digest is stored. Nothing else ever prints a secret, a key or a
 * user identifier. Each change writes an audit event.
 *
 * (Node 22.18+ runs TypeScript directly; only erasable syntax is used. The
 * application modules use `@/` imports and `server-only`, so the few crypto
 * steps are repeated here; tests/unit/oidc-provider.test.ts pins them to
 * lib/oidc/*.)
 */
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import { z } from "zod";

/** Must equal OIDC_SECRET_HKDF_LABEL in lib/oidc/secrets.ts. */
export const OIDC_SECRET_HKDF_LABEL = "yuyu-oidc-provider-secrets-v1";
/** Must equal OIDC_SCOPES in lib/oidc/config.ts. */
export const KNOWN_SCOPES = ["openid", "profile", "yuyu.events"] as const;
const RETIRED_KEY_PUBLISH_MS = 7 * 24 * 60 * 60_000;

export function oidcEncryptionKey(rawKey: string | undefined): Buffer {
  const raw = rawKey ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    throw new Error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  }
  return Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), OIDC_SECRET_HKDF_LABEL, 32));
}

/** Same format as lib/oidc/secrets.ts encryptOidcSecret: v1.iv.tag.ciphertext (base64url). */
export function encryptOidcSecret(value: string, rawKey: string | undefined): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", oidcEncryptionKey(rawKey), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export const sha256Hex = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
export const newClientId = () => `yyc_${crypto.randomBytes(16).toString("base64url")}`;
export const newClientSecret = () => `yys_${crypto.randomBytes(32).toString("base64url")}`;

/** Same rule as isRegistrableRedirectUri in lib/oidc/primitives.ts. */
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

const redirectUris = z.array(z.string().refine(isRegistrableRedirectUri, "Redirect URIs must be absolute https:// (http:// only for localhost), without a fragment or credentials.")).min(1).max(10);
const clientIdArg = z.string().regex(/^yyc_[A-Za-z0-9_-]{22}$/, "Unknown client id format.");

export const registerArgsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  redirectUris,
  scopes: z.string().default("openid profile").transform((value) => value.split(/\s+/).filter(Boolean)).pipe(
    z.array(z.enum(KNOWN_SCOPES)).min(1).refine((list) => list.includes("openid"), "Scopes must include openid.").refine((list) => new Set(list).size === list.length, "Duplicate scope."),
  ),
  public: z.boolean().default(false),
  firstParty: z.boolean().default(false),
}).strict();

/** Build the row for a new client. Returns the one-time secret separately. */
export function buildClient(args: z.infer<typeof registerArgsSchema>, rawKey: string | undefined) {
  const clientId = newClientId();
  const clientSecret = args.public ? null : newClientSecret();
  return {
    clientSecret,
    data: {
      clientId,
      name: args.name,
      secretHash: clientSecret ? sha256Hex(clientSecret) : null,
      redirectUris: args.redirectUris,
      allowedScopes: args.scopes,
      pairwiseSaltEncrypted: encryptOidcSecret(crypto.randomBytes(32).toString("base64url"), rawKey),
      firstParty: args.firstParty,
    },
  };
}

/** Minimal flag parser: repeated --redirect-uri, boolean --public/--first-party. */
export function parseFlags(argv: string[]) {
  const values: Record<string, string | boolean | string[]> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--")) throw new Error(`Unexpected argument: ${flag}`);
    const name = flag.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (name === "public" || name === "firstParty") {
      values[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    index += 1;
    if (name === "redirectUri") (values.redirectUris = [...((values.redirectUris as string[] | undefined) ?? []), value]);
    else values[name] = value;
  }
  return values;
}

async function newSigningKey(rawKey: string | undefined) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(publicJwk);
  return {
    kid,
    alg: "ES256",
    publicJwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y, kid, alg: "ES256", use: "sig" },
    privateJwkEncrypted: encryptOidcSecret(JSON.stringify(await exportJWK(privateKey)), rawKey),
  };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) fail(result.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("\n"));
  return result.data;
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const rawKey = process.env.MFA_ENCRYPTION_KEY;
  const prisma = new PrismaClient();
  const audit = (action: string, targetType: string, targetId: string, metadata?: Record<string, string | number | boolean>) =>
    prisma.auditEvent.create({ data: { action, targetType, targetId, metadata: { via: "cli", ...metadata } } });
  try {
    switch (command) {
      case "register": {
        const args = parsed(registerArgsSchema, flags);
        const { clientSecret, data } = buildClient(args, rawKey);
        const created = await prisma.$transaction(async (tx) => {
          const row = await tx.oAuthClient.create({ data, select: { id: true } });
          await tx.auditEvent.create({ data: { action: "OAUTH_CLIENT_REGISTERED", targetType: "OAuthClient", targetId: row.id, metadata: { via: "cli", client: data.clientId, redirectUris: data.redirectUris.length, scopes: data.allowedScopes.join(" "), public: args.public } } });
          return row;
        });
        console.log(`Registered "${data.name}" (${created.id}).`);
        console.log(`client_id:     ${data.clientId}`);
        if (clientSecret) console.log(`client_secret: ${clientSecret}\n\nThe secret is shown once. Store it in the app's secret store now.`);
        else console.log("Public client: no secret; PKCE protects the code exchange.");
        break;
      }
      case "list": {
        const clients = await prisma.oAuthClient.findMany({
          orderBy: { createdAt: "asc" },
          select: { clientId: true, name: true, status: true, firstParty: true, redirectUris: true, allowedScopes: true, secretHash: true, createdAt: true },
        });
        for (const client of clients) {
          console.log(`${client.clientId}  ${client.status}  ${client.name}${client.firstParty ? " (first party)" : ""}${client.secretHash ? "" : " (public)"}`);
          console.log(`  scopes: ${client.allowedScopes.join(" ")}`);
          for (const uri of client.redirectUris) console.log(`  redirect: ${uri}`);
        }
        if (clients.length === 0) console.log("No OAuth clients are registered.");
        break;
      }
      case "rotate-secret": {
        const clientId = parsed(clientIdArg, flags.clientId);
        const secret = newClientSecret();
        const row = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { id: true, secretHash: true } });
        if (!row) fail("No such client.");
        if (!row.secretHash) fail("This is a public client; it has no secret.");
        await prisma.$transaction([
          prisma.oAuthClient.update({ where: { id: row.id }, data: { secretHash: sha256Hex(secret) } }),
          audit("OAUTH_CLIENT_SECRET_ROTATED", "OAuthClient", row.id, { client: clientId }),
        ]);
        console.log(`client_secret: ${secret}\n\nThe old secret stopped working. The new one is shown once.`);
        break;
      }
      case "set-redirect-uris": {
        const clientId = parsed(clientIdArg, flags.clientId);
        const uris = parsed(redirectUris, flags.redirectUris);
        const row = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { id: true } });
        if (!row) fail("No such client.");
        await prisma.$transaction([
          prisma.oAuthClient.update({ where: { id: row.id }, data: { redirectUris: uris } }),
          audit("OAUTH_CLIENT_UPDATED", "OAuthClient", row.id, { client: clientId, redirectUris: uris.length }),
        ]);
        console.log(`Saved ${uris.length} redirect URI(s).`);
        break;
      }
      case "disable":
      case "enable": {
        const clientId = parsed(clientIdArg, flags.clientId);
        const row = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { id: true } });
        if (!row) fail("No such client.");
        const disabling = command === "disable";
        await prisma.$transaction([
          prisma.oAuthClient.update({ where: { id: row.id }, data: { status: disabling ? "DISABLED" : "ACTIVE" } }),
          ...(disabling ? [prisma.oAuthSession.updateMany({ where: { clientId: row.id, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
          audit(disabling ? "OAUTH_CLIENT_DISABLED" : "OAUTH_CLIENT_ENABLED", "OAuthClient", row.id, { client: clientId }),
        ]);
        console.log(disabling ? "Client disabled; its sessions are revoked." : "Client enabled.");
        break;
      }
      case "rotate-key": {
        const material = await newSigningKey(rawKey);
        const now = new Date();
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`LOCK TABLE "OAuthSigningKey" IN SHARE ROW EXCLUSIVE MODE`;
          await tx.oAuthSigningKey.updateMany({ where: { retiredAt: null }, data: { retiredAt: now, expiresAt: new Date(now.getTime() + RETIRED_KEY_PUBLISH_MS) } });
          await tx.oAuthSigningKey.create({ data: material });
          await tx.auditEvent.create({ data: { action: "OAUTH_SIGNING_KEY_ROTATED", targetType: "OAuthSigningKey", targetId: material.kid, metadata: { via: "cli" } } });
        });
        console.log(`New signing key ${material.kid} is active. The previous key stays in the JWKS for 7 days.`);
        break;
      }
      default:
        fail("Usage: scripts/oauth-register-client.ts <register|list|rotate-secret|set-redirect-uris|disable|enable|rotate-key> [flags]");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    // Never print a stack that could include configuration values.
    console.error(error instanceof Error && /MFA_ENCRYPTION_KEY|Unexpected argument|Missing value/.test(error.message) ? error.message : "The command failed.");
    process.exit(1);
  });
}
