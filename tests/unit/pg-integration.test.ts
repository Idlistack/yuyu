import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EventPermission, MembershipRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

/*
 * People's Gallery integration contract (docs/PG_INTEGRATION.md): strict DTOs
 * without contact data, the signature vector shared with PG, resource
 * versions and keys, the D-2 role mapping, target rules and the CLI's crypto.
 */

process.env.MFA_ENCRYPTION_KEY ||= Buffer.alloc(32, 5).toString("base64");
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  buildPgEnvelope,
  PG_EVENT_TYPES,
  pgApiEventItemSchema,
  pgApiEventRoleItemSchema,
  pgApiOrganisationSchema,
  pgApiRegistrationItemSchema,
  pgApiUserRolesSchema,
  pgDataSchemas,
  pgEnvelopeSchema,
  pgRoleFor,
  publicResourceKey,
} from "@/lib/pgIntegration/contract";
import { absoluteHttpUrl, canonicalJson, displayNameFor, eventDtoFromSnapshot, utcIso } from "@/lib/pgIntegration/delivery";
import { decryptPgIntegrationSecret, encryptPgIntegrationSecret, PG_INTEGRATION_SECRET_HKDF_LABEL } from "@/lib/pgIntegration/secrets";
import { isForbiddenInternalAddress, parseIntegrationUrl } from "@/lib/pgIntegration/target";
import { computeWebhookSignature, isWebhookSecretShape, verifyWebhookSignature, webhookSignatureHeader } from "@/lib/webhooks/signature";
import * as cli from "@/scripts/pg-integration";

const root = resolve(import.meta.dirname, "../..");
const SUBJECT = "q".repeat(43);

/** Every object key reachable from a Zod schema. */
function keysOf(schema: z.ZodTypeAny, out = new Set<string>()): Set<string> {
  if (schema instanceof z.ZodObject) {
    for (const [key, value] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
      out.add(key);
      keysOf(value, out);
    }
  } else if (schema instanceof z.ZodArray) keysOf(schema.element as z.ZodTypeAny, out);
  else if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) keysOf(schema.unwrap() as z.ZodTypeAny, out);
  else if (schema instanceof z.ZodUnion) for (const option of schema.options as z.ZodTypeAny[]) keysOf(option, out);
  else if (schema instanceof z.ZodRecord) keysOf(schema.valueType as z.ZodTypeAny, out);
  return out;
}

const FORBIDDEN_KEY = /email|phone|answer|ticket|token|secret|password|userId|guest|address|feedback|certificate|invite/i;

describe("People's Gallery DTOs", () => {
  const schemas: Record<string, z.ZodTypeAny> = {
    ...pgDataSchemas,
    envelope: pgEnvelopeSchema,
    apiEvent: pgApiEventItemSchema,
    apiRegistration: pgApiRegistrationItemSchema,
    apiEventRole: pgApiEventRoleItemSchema,
    apiUserRoles: pgApiUserRolesSchema,
    apiOrganisation: pgApiOrganisationSchema,
  };

  it.each(Object.keys(schemas))("%s carries no contact data, answers, tickets, tokens or user ids", (name) => {
    const keys = [...keysOf(schemas[name]!)];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => FORBIDDEN_KEY.test(key))).toEqual([]);
  });

  it("covers every event type, including the P3 placeholders", () => {
    expect(Object.keys(pgDataSchemas).sort()).toEqual([...PG_EVENT_TYPES].sort());
  });

  const event = {
    kind: "event", id: "cmevent1", occurrenceId: null, title: "Tech4Good Summit 2026", slug: "t4g-summit-2026",
    startDateTime: "2026-11-14T03:30:00.000Z", endDateTime: "2026-11-14T12:30:00.000Z", timezone: "Asia/Kolkata",
    location: "NIMHANS Convention Centre, Bengaluru", coverImageUrl: null, status: "PUBLISHED", privacyType: "PUBLIC",
  };
  const registration = {
    id: "cmrsvp1", status: "CONFIRMED", displayName: "Praveen Kumar", registeredAt: "2026-10-31T10:00:00.000Z",
    checkedInAt: null, subject: SUBJECT, isCrew: false, isMinor: false,
  };

  it("rejects extra fields everywhere (strict)", () => {
    const base = { id: `evt_${"a".repeat(32)}`, type: "registration.created" as const, createdAt: new Date(), organisation: { id: "o", slug: "t4g" }, resourceVersion: 1 };
    expect(() => buildPgEnvelope({ ...base, data: { event: { kind: "event", id: "e", occurrenceId: null }, registration } })).not.toThrow();
    expect(() => buildPgEnvelope({ ...base, data: { event: { kind: "event", id: "e", occurrenceId: null }, registration: { ...registration, email: "a@b.c" } } })).toThrow();
    expect(() => buildPgEnvelope({ ...base, data: { event: { kind: "event", id: "e", occurrenceId: null }, registration: { ...registration, checkInToken: "x" } } })).toThrow();
    expect(() => buildPgEnvelope({ ...base, data: { event: { kind: "event", id: "e", occurrenceId: null }, registration, answers: {} } })).toThrow();
    expect(() => pgDataSchemas["event.created"].parse({ event: { ...event, description: "long text" } })).toThrow();
    expect(() => pgDataSchemas["access.changed"].parse({ subject: SUBJECT, organisationId: "o", eventId: null, occurrenceId: null, userId: "u" })).toThrow();
    // A subject is a 43-character pairwise value, never a cuid or an email.
    expect(() => pgDataSchemas["user.sessions_revoked"].parse({ subject: "cmuser123", reason: "session_version" })).toThrow();
    expect(() => pgDataSchemas["user.sessions_revoked"].parse({ subject: "a@b.example", reason: "session_version" })).toThrow();
  });

  it("validates resourceVersion as a positive safe integer and the envelope id shape", () => {
    const base = { id: `evt_${"b".repeat(32)}`, type: "ping" as const, createdAt: new Date(), organisation: null, data: { message: "hi" } };
    expect(buildPgEnvelope({ ...base, resourceVersion: 1793440800123 }).resourceVersion).toBe(1793440800123);
    for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2]) expect(() => buildPgEnvelope({ ...base, resourceVersion: bad })).toThrow();
    expect(() => buildPgEnvelope({ ...base, id: "evt_123", resourceVersion: 1 })).toThrow();
  });

  it("maps internal resource keys to subject keys and never leaks a user id", () => {
    const subjectOf = (userId: string) => `sub(${userId})`;
    expect(publicResourceKey("access:cmuser1:cmorg1", subjectOf)).toBe("access:sub(cmuser1):cmorg1");
    expect(publicResourceKey("user:cmuser1", subjectOf)).toBe("user:sub(cmuser1)");
    expect(publicResourceKey("event:cmevent1:", subjectOf)).toBe("event:cmevent1:");
    expect(publicResourceKey("registration:cmrsvp1", subjectOf)).toBe("registration:cmrsvp1");
  });
});

describe("resource versions (capture triggers)", () => {
  const sql = readFileSync(resolve(root, "prisma/migrations/20261031010000_pg_integration/migration.sql"), "utf8");

  it("bump monotonically per key under the row lock: max(previous + 1, epoch ms)", () => {
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE SET\n    "version" = GREATEST(r."version" + 1, EXCLUDED."version")');
    expect(sql).toContain("floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint");
    // The version and the delivery row are written together, in the caller's transaction.
    const enqueue = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION "pg_integration_enqueue"'), sql.indexOf("-- Events (one-off"));
    expect(enqueue.indexOf('INSERT INTO "PgIntegrationResource"')).toBeLessThan(enqueue.indexOf('INSERT INTO "PgIntegrationDelivery"'));
    expect(enqueue).toContain("RETURNING r.\"version\" INTO v_version");
  });

  it("simulates monotonic versions under clock skew", () => {
    // The SQL rule, replayed: a clock that goes backwards still yields increasing versions.
    const next = (previous: number | null, nowMs: number) => (previous === null ? nowMs : Math.max(previous + 1, nowMs));
    let version: number | null = null;
    const seen: number[] = [];
    for (const nowMs of [1000, 1000, 999, 5000, 4000, 4000]) {
      version = next(version, nowMs);
      seen.push(version);
    }
    expect(seen).toEqual([1000, 1001, 1002, 5000, 5001, 5002]);
  });

  it("is additive, timezone-safe and never captures contact data", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql.match(/ALTER TABLE "(?!PgIntegration|OAuthClientToken)[A-Za-z]+"/g)).toEqual(['ALTER TABLE "OAuthGrant"']);
    expect(sql).toContain('ALTER TABLE "OAuthGrant" ADD COLUMN     "subject" TEXT;');
    // Trigger rows use UTC wall-clock time, never the session TimeZone.
    expect(sql.slice(sql.indexOf("-- Capture helpers"))).not.toMatch(/CURRENT_TIMESTAMP|\bnow\(\)/);
    expect(sql).toContain("(clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)");
    expect(sql).not.toMatch(/guestEmail|checkInToken|"email"|passwordHash|RsvpAnswer/);
    expect(sql).toContain("current_setting('yuyu.pg_rsvp_delete_status', true)");
  });
});

describe("shared signature vector (contract §1.2, pinned by PG too)", () => {
  const secret = "whsec_MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
  const t = 1792656000;
  const body = '{"id":"evt_00000000000000000000000000000001","type":"ping","createdAt":"2026-10-31T00:00:00.000Z","organisation":null,"resourceVersion":1,"data":{"message":"Hello from Yuyu"}}';
  const header = "t=1792656000,v1=cb6fd559242302bf087581b7abd6036bfac6a37dd88275ac3b34173a3e09ee74";

  it("produces the agreed header with the org-webhook scheme", () => {
    expect(isWebhookSecretShape(secret)).toBe(true);
    expect(webhookSignatureHeader(secret, t, body)).toBe(header);
    expect(computeWebhookSignature(secret, t, body)).toBe(crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(`${t}.${body}`).digest("hex"));
    expect(verifyWebhookSignature({ secret, header, body, now: t + 299 })).toBe(true);
    expect(verifyWebhookSignature({ secret, header, body, now: t + 301 })).toBe(false);
    expect(verifyWebhookSignature({ secret, header, body: body.replace("Yuyu", "yuyu"), now: t })).toBe(false);
    expect(pgEnvelopeSchema.parse(JSON.parse(body)).type).toBe("ping");
  });

  it("serialises retries byte for byte (sorted keys at every level)", () => {
    const a = canonicalJson({ type: "ping", id: "x", data: { z: 1, a: [{ b: 2, a: 1 }] } });
    const b = canonicalJson({ data: { a: [{ a: 1, b: 2 }], z: 1 }, id: "x", type: "ping" });
    expect(a).toBe(b);
    expect(a).toBe('{"data":{"a":[{"a":1,"b":2}],"z":1},"id":"x","type":"ping"}');
  });
});

describe("D-2 role mapping", () => {
  const cases: Array<[MembershipRole | null, EventPermission[], "admin" | "viewer" | null]> = [
    [MembershipRole.OWNER, [], "admin"],
    [MembershipRole.ADMIN, [], "admin"],
    [MembershipRole.MEMBER, [], "viewer"],
    [null, [EventPermission.EDIT_DETAILS], "admin"],
    [null, [EventPermission.PUBLISH_AND_SCHEDULE], "admin"],
    [null, [EventPermission.MANAGE_REGISTRATIONS], "viewer"],
    [null, [EventPermission.MANAGE_REGISTRATIONS, EventPermission.EDIT_DETAILS], "admin"],
    [MembershipRole.MEMBER, [EventPermission.PUBLISH_AND_SCHEDULE], "admin"],
    [null, [EventPermission.CHECK_IN], null],
    [null, [EventPermission.MANAGE_INVITATIONS], null],
    [null, [EventPermission.JUDGE], null],
    [null, [EventPermission.CHECK_IN, EventPermission.MANAGE_INVITATIONS, EventPermission.JUDGE], null],
    [null, [], null],
  ];
  it.each(cases)("org %s with %j → %s", (orgRole, collaboratorPermissions, expected) => {
    expect(pgRoleFor({ orgRole, collaboratorPermissions })).toBe(expected);
  });
});

describe("snapshot mapping", () => {
  it("reads trigger timestamps as UTC and keeps cover URLs absolute", () => {
    expect(utcIso("2026-11-14T03:30:00")).toBe("2026-11-14T03:30:00.000Z");
    expect(utcIso("2026-11-14T03:30:00.123")).toBe("2026-11-14T03:30:00.123Z");
    expect(utcIso(null)).toBeNull();
    expect(absoluteHttpUrl("/api/uploads/org/event-covers/a.webp", "https://yuyu.example")).toBe("https://yuyu.example/api/uploads/org/event-covers/a.webp");
    expect(absoluteHttpUrl("javascript:alert(1)", "https://yuyu.example")).toBeNull();
    expect(absoluteHttpUrl(null)).toBeNull();
    const dto = eventDtoFromSnapshot({
      id: "e1", organisationId: "o1", title: "T", slug: "t", startDateTime: "2026-11-14T03:30:00", endDateTime: "2026-11-14T12:30:00",
      timezone: "Asia/Kolkata", location: "Bengaluru", coverImageUrl: null, status: "PUBLISHED", privacyType: "PUBLIC",
    });
    expect(pgDataSchemas["event.created"].parse({ event: dto }).event.startDateTime).toBe("2026-11-14T03:30:00.000Z");
    expect(displayNameFor("  ", "  Guest ")).toBe("Guest");
    expect(displayNameFor(null, null)).toBe("Participant");
  });
});

describe("integration target rules", () => {
  it("keeps the org-webhook SSRF rules unless an internal target is explicitly allowed", () => {
    delete process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS;
    expect(parseIntegrationUrl("http://pg-api.pg.svc.cluster.local:8000/x", { allowInternalTarget: false }).ok).toBe(false);
    expect(parseIntegrationUrl("https://10.43.0.10/x", { allowInternalTarget: false }).ok).toBe(false);
    expect(parseIntegrationUrl("https://photos.example.org/api/v2/integrations/yuyu/events", { allowInternalTarget: false }).ok).toBe(true);
    expect(parseIntegrationUrl("http://pg-api.pg.svc.cluster.local:8000/x", { allowInternalTarget: true }).ok).toBe(true);
    expect(parseIntegrationUrl("http://10.43.0.10:8000/x", { allowInternalTarget: true }).ok).toBe(true);
    expect(parseIntegrationUrl("http://user:pw@10.43.0.10/x", { allowInternalTarget: true }).ok).toBe(false);
    expect(parseIntegrationUrl("ftp://10.43.0.10/x", { allowInternalTarget: true }).ok).toBe(false);
    expect(parseIntegrationUrl("http://169.254.169.254/latest", { allowInternalTarget: true }).ok).toBe(false);
    expect(parseIntegrationUrl("http://127.0.0.1:8080/x", { allowInternalTarget: true }).ok).toBe(false);
  });

  it("never reaches metadata, link-local, multicast, unspecified or (outside dev) loopback addresses", () => {
    for (const address of ["169.254.169.254", "0.0.0.0", "224.0.0.1", "255.255.255.255", "fe80::1", "ff02::1", "::", "::ffff:169.254.169.254"]) {
      expect(isForbiddenInternalAddress(address, true)).toBe(true);
    }
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(isForbiddenInternalAddress(address)).toBe(true);
      expect(isForbiddenInternalAddress(address, true)).toBe(false);
    }
    for (const address of ["10.42.1.7", "10.43.0.10", "172.16.5.4", "192.168.1.20", "100.64.0.1", "fd00::5", "8.8.8.8"]) {
      expect(isForbiddenInternalAddress(address)).toBe(false);
    }
  });
});

describe("operator CLI (scripts/pg-integration.ts)", () => {
  it("encrypts the signing secret exactly like the application decrypts it", () => {
    expect(cli.PG_INTEGRATION_SECRET_HKDF_LABEL).toBe(PG_INTEGRATION_SECRET_HKDF_LABEL);
    const secret = cli.newSigningSecret();
    expect(isWebhookSecretShape(secret)).toBe(true);
    expect(decryptPgIntegrationSecret(cli.encryptPgIntegrationSecret(secret, process.env.MFA_ENCRYPTION_KEY))).toBe(secret);
    expect(decryptPgIntegrationSecret(encryptPgIntegrationSecret(secret))).toBe(secret);
    expect(() => cli.encryptPgIntegrationSecret(secret, "short")).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it("checks endpoint URLs and parses flags", () => {
    expect(cli.checkEndpointUrl("http://pg-api.pg.svc:8000/x", false)).toMatch(/allow-internal-target/);
    expect(cli.checkEndpointUrl("http://pg-api.pg.svc:8000/x", true)).toBeNull();
    expect(cli.checkEndpointUrl("https://u:p@photos.example.org/x", false)).toMatch(/password/);
    expect(cli.parseFlags(["--client-id", "yyc_x", "--allow-internal-target"])).toEqual({ clientId: "yyc_x", allowInternalTarget: true });
    expect(() => cli.parseFlags(["--endpoint-url"])).toThrow(/Missing value/);
  });
});
