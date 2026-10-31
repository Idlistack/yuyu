/**
 * Operator CLI for the People's Gallery integration (docs/PG_INTEGRATION.md).
 * Run it with exactly the environment the application receives (DATABASE_URL
 * and MFA_ENCRYPTION_KEY), for example inside the migrator image or job:
 *
 *   npm run pg:integration -- configure --client-id yyc_… \
 *     --endpoint-url https://photos.example.org/api/v2/integrations/yuyu/events
 *   npm run pg:integration -- configure --client-id yyc_… \
 *     --endpoint-url http://peoplegallery-api.pg.svc.cluster.local:8000/api/v2/integrations/yuyu/events \
 *     --allow-internal-target
 *   ... configure ... --public-url https://photos.example.org
 *                                   (PG's browser origin: selfie uploads and email deep links)
 *   ... status
 *   ... enable-org --org <slug>     (seeds versions so PG's backfill sees every event)
 *   ... disable-org --org <slug>
 *   ... enable | disable            (the whole integration; queued deliveries wait)
 *   ... rotate-secret               (prints the new secret once)
 *   ... ping                        (queues a signed `ping` delivery)
 *   ... redrive [--event-id evt_…]  (dead-lettered deliveries go back to the queue)
 *
 * `configure` (first time) and `rotate-secret` print the signing secret ONCE;
 * it is stored only encrypted. `configure` also adds the machine scope
 * `yuyu.integration` to the OAuth client, which must be confidential and first
 * party. Every change writes an audit event; nothing prints a user identifier.
 *
 * (Node 22.18+ runs TypeScript directly; only erasable syntax is used. The
 * crypto steps repeat lib/pgIntegration/secrets.ts and lib/webhooks/signature.ts;
 * tests/unit/pg-integration.test.ts pins them together.)
 */
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

/** Must equal PG_INTEGRATION_SECRET_HKDF_LABEL in lib/pgIntegration/secrets.ts. */
export const PG_INTEGRATION_SECRET_HKDF_LABEL = "yuyu-pg-integration-signing-secret-v1";
export const PG_INTEGRATION_SCOPE = "yuyu.integration";

export function encryptPgIntegrationSecret(value: string, rawKey: string | undefined): string {
  const raw = rawKey ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    throw new Error("MFA_ENCRYPTION_KEY must be valid base64 for a 32-byte key.");
  }
  const derived = Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), PG_INTEGRATION_SECRET_HKDF_LABEL, 32));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derived, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

/** Same shape as generateWebhookSecret in lib/webhooks/signature.ts. */
export const newSigningSecret = () => `whsec_${crypto.randomBytes(32).toString("base64url")}`;

/**
 * Offline URL check. Without --allow-internal-target only public https is
 * accepted here; the full SSRF rules (DNS, address classes) run again before
 * every delivery (lib/pgIntegration/target.ts).
 */
export function checkEndpointUrl(value: string, allowInternalTarget: boolean): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a valid URL.";
  }
  if (value.length > 2048) return "The URL is too long.";
  if (url.username || url.password) return "Remove the user name or password from the URL; requests are signed instead.";
  if (allowInternalTarget) return url.protocol === "https:" || url.protocol === "http:" ? null : "Use http:// or https://.";
  if (url.protocol !== "https:") return "Use https://, or pass --allow-internal-target for an in-cluster receiver.";
  return null;
}

/** PG's public origin (selfie uploads, notification deep links): an origin only, https unless internal targets are allowed. */
export function checkPublicUrl(value: string, allowInternalTarget: boolean): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a valid public URL.";
  }
  if (url.username || url.password) return "Remove the user name or password from the public URL.";
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return "The public URL is an origin only, like https://photos.example.org.";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && allowInternalTarget) return null;
  return "Use an https:// public URL.";
}

const clientIdArg = z.string().regex(/^yyc_[A-Za-z0-9_-]{22}$/, "Unknown client id format.");
const eventIdArg = z.string().regex(/^evt_[0-9a-f]{32}$/, "Unknown event id format.");
const slugArg = z.string().trim().min(1).max(100);

export function parseFlags(argv: string[]) {
  const values: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--")) throw new Error(`Unexpected argument: ${flag}`);
    const name = flag.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (name === "allowInternalTarget" || name === "publicTargetOnly") {
      values[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    index += 1;
    values[name] = value;
  }
  return values;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) fail(result.error.issues.map((issue) => issue.message).join("\n"));
  return result.data;
}

function hostLabel(raw: string) {
  try {
    return new URL(raw).host;
  } catch {
    return "invalid";
  }
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const rawKey = process.env.MFA_ENCRYPTION_KEY;
  const prisma = new PrismaClient();
  const audit = (action: string, targetType: string, targetId: string, metadata?: Record<string, string | number | boolean>) =>
    prisma.auditEvent.create({ data: { action, targetType, targetId, metadata: { via: "cli", ...metadata } } });
  const integration = () => prisma.pgIntegration.findUnique({ where: { id: "default" } });
  try {
    switch (command) {
      case "configure": {
        const clientId = parsed(clientIdArg, flags.clientId);
        const endpointUrl = parsed(z.string().trim().min(1), flags.endpointUrl);
        const existing = await integration();
        const allowInternalTarget = flags.allowInternalTarget === true ? true : flags.publicTargetOnly === true ? false : existing?.allowInternalTarget ?? false;
        const urlError = checkEndpointUrl(endpointUrl, allowInternalTarget);
        if (urlError) fail(urlError);
        const publicUrlFlag = typeof flags.publicUrl === "string" ? flags.publicUrl.trim() : undefined;
        if (publicUrlFlag !== undefined) {
          const publicUrlError = checkPublicUrl(publicUrlFlag, allowInternalTarget);
          if (publicUrlError) fail(publicUrlError);
        }
        const publicUrl = publicUrlFlag === undefined ? undefined : new URL(publicUrlFlag).origin;
        const client = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { id: true, secretHash: true, firstParty: true, allowedScopes: true, status: true } });
        if (!client) fail("No such OAuth client.");
        if (!client.secretHash || !client.firstParty) fail("The client must be confidential (have a secret) and registered with --first-party.");
        const secret = existing ? null : newSigningSecret();
        await prisma.$transaction(async (tx) => {
          if (!client.allowedScopes.includes(PG_INTEGRATION_SCOPE)) {
            await tx.oAuthClient.update({ where: { id: client.id }, data: { allowedScopes: [...client.allowedScopes, PG_INTEGRATION_SCOPE] } });
            await tx.auditEvent.create({ data: { action: "OAUTH_CLIENT_UPDATED", targetType: "OAuthClient", targetId: client.id, metadata: { via: "cli", client: clientId, scopeAdded: PG_INTEGRATION_SCOPE } } });
          }
          await tx.pgIntegration.upsert({
            where: { id: "default" },
            create: { id: "default", oauthClientId: client.id, endpointUrl, allowInternalTarget, publicUrl: publicUrl ?? null, secretEncrypted: encryptPgIntegrationSecret(secret!, rawKey) },
            update: { oauthClientId: client.id, endpointUrl, allowInternalTarget, ...(publicUrl !== undefined ? { publicUrl } : {}) },
          });
          await tx.auditEvent.create({ data: { action: existing ? "PG_INTEGRATION_UPDATED" : "PG_INTEGRATION_CONFIGURED", targetType: "PgIntegration", targetId: "default", metadata: { via: "cli", host: hostLabel(endpointUrl), allowInternalTarget, client: clientId, ...(publicUrl ? { publicHost: hostLabel(publicUrl) } : {}) } } });
        });
        console.log(`People's Gallery integration ${existing ? "updated" : "configured"}: ${hostLabel(endpointUrl)}${allowInternalTarget ? " (internal target allowed)" : ""}.`);
        if (secret) console.log(`signing secret: ${secret}\n\nThe secret is shown once. Give it to People's Gallery (YUYU_WEBHOOK_SECRET) now.`);
        break;
      }
      case "rotate-secret": {
        if (!(await integration())) fail("The integration is not configured.");
        const secret = newSigningSecret();
        await prisma.$transaction([
          prisma.pgIntegration.update({ where: { id: "default" }, data: { secretEncrypted: encryptPgIntegrationSecret(secret, rawKey) } }),
          audit("PG_INTEGRATION_SECRET_ROTATED", "PgIntegration", "default"),
        ]);
        console.log(`signing secret: ${secret}\n\nThe next delivery is signed with it. Update People's Gallery now (it accepts a list during rotation).`);
        break;
      }
      case "enable":
      case "disable": {
        if (!(await integration())) fail("The integration is not configured.");
        const enabled = command === "enable";
        await prisma.$transaction([
          prisma.pgIntegration.update({ where: { id: "default" }, data: { enabled } }),
          audit(enabled ? "PG_INTEGRATION_ENABLED" : "PG_INTEGRATION_DISABLED", "PgIntegration", "default"),
        ]);
        console.log(enabled ? "Integration enabled." : "Integration disabled: nothing new is captured; queued deliveries wait.");
        break;
      }
      case "enable-org":
      case "disable-org": {
        const slug = parsed(slugArg, flags.org);
        if (!(await integration())) fail("The integration is not configured.");
        const org = await prisma.organisation.findUnique({ where: { slug }, select: { id: true } });
        if (!org) fail("No such organisation.");
        if (command === "enable-org") {
          const seeded = await prisma.$transaction(async (tx) => {
            await tx.pgIntegrationOrganisation.upsert({ where: { organisationId: org.id }, create: { organisationId: org.id, integrationId: "default" }, update: {} });
            const [row] = await tx.$queryRaw<Array<{ events: number }>>`SELECT "pg_integration_seed_organisation"(${org.id}) AS "events"`;
            await tx.auditEvent.create({ data: { action: "PG_INTEGRATION_ORG_ENABLED", organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { via: "cli" } } });
            return row?.events ?? 0;
          });
          console.log(`Enabled for ${slug}; ${seeded} event(s) ready for People's Gallery's backfill.`);
        } else {
          await prisma.$transaction([
            prisma.pgIntegrationOrganisation.deleteMany({ where: { organisationId: org.id } }),
            prisma.auditEvent.create({ data: { action: "PG_INTEGRATION_ORG_DISABLED", organisationId: org.id, targetType: "Organisation", targetId: org.id, metadata: { via: "cli" } } }),
          ]);
          console.log(`Disabled for ${slug}. Already queued deliveries are still sent.`);
        }
        break;
      }
      case "status": {
        const row = await prisma.pgIntegration.findUnique({
          where: { id: "default" },
          select: { endpointUrl: true, publicUrl: true, enabled: true, allowInternalTarget: true, lastSuccessAt: true, lastFailureAt: true, oauthClient: { select: { clientId: true, name: true } }, organisations: { select: { organisation: { select: { slug: true } } } } },
        });
        if (!row) {
          console.log("The integration is not configured.");
          break;
        }
        const counts = await prisma.pgIntegrationDelivery.groupBy({ by: ["status"], _count: { _all: true } });
        console.log(`${row.enabled ? "ENABLED" : "DISABLED"}  ${hostLabel(row.endpointUrl)}${row.allowInternalTarget ? " (internal target allowed)" : ""}`);
        console.log(`  client: ${row.oauthClient.clientId} (${row.oauthClient.name})`);
        console.log(`  public URL: ${row.publicUrl ?? "not set (selfie step and notifications are off)"}`);
        console.log(`  organisations: ${row.organisations.map((entry) => entry.organisation.slug).join(", ") || "none"}`);
        console.log(`  last success: ${row.lastSuccessAt?.toISOString() ?? "never"}; last failure: ${row.lastFailureAt?.toISOString() ?? "never"}`);
        console.log(`  deliveries: ${counts.map((count) => `${count.status.toLowerCase()} ${count._count._all}`).join(", ") || "none"}`);
        break;
      }
      case "ping": {
        if (!(await integration())) fail("The integration is not configured.");
        const id = `evt_${crypto.randomBytes(16).toString("hex")}`;
        await prisma.pgIntegrationDelivery.create({
          data: { id, eventType: "ping", resourceKey: "ping", resourceVersion: BigInt(Date.now()), snapshot: { message: "This is a test event from Yuyu." } },
        });
        console.log(`Queued ping ${id}; the outbox worker sends it within a minute.`);
        break;
      }
      case "redrive": {
        const eventId = flags.eventId === undefined ? undefined : parsed(eventIdArg, flags.eventId);
        const result = await prisma.pgIntegrationDelivery.updateMany({
          where: { status: "FAILED", ...(eventId ? { id: eventId } : {}) },
          data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
        });
        await audit("PG_INTEGRATION_REDRIVEN", "PgIntegration", "default", { deliveries: result.count });
        console.log(`${result.count} delivery(ies) queued again.`);
        break;
      }
      default:
        fail("Usage: scripts/pg-integration.ts <configure|status|enable|disable|enable-org|disable-org|rotate-secret|ping|redrive> [flags]");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error && /MFA_ENCRYPTION_KEY|Unexpected argument|Missing value/.test(error.message) ? error.message : "The command failed.");
    process.exit(1);
  });
}
