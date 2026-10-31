import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { EventPrivacyType, EventStatus, OutboxStatus, RsvpStatus, WebhookDeliveryStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * People's Gallery P3 against PostgreSQL (docs/PG_INTEGRATION.md#selfie-step,
 * #pg-callbacks, #attendee-notifications): consent records and the 18+
 * attestation, 10-minute single-use enrollment tickets, PG's status and
 * withdrawal callbacks, the selfie.* / consent.* outbox events, and the
 * idempotent notification API with its emails. No image ever reaches Yuyu,
 * so no test here sends one.
 */

process.env.REDIS_URL = "";
process.env.NEXT_PUBLIC_BASE_URL = "https://yuyu.test";
process.env.MFA_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

const identity = vi.hoisted(() => ({ id: "" }));
const mocks = vi.hoisted(() => ({ sendPgPhotosEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": `198.51.100.${Math.floor(Math.random() * 250)}` }) }));
vi.mock("@/lib/outboxWorker", () => ({ startOutboxWorker: vi.fn() }));
vi.mock("@/lib/email/transporter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/transporter")>()),
  getEmailTransport: async () => ({ from: "test@example.test", transporter: null, source: "env" }),
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendPgPhotosEmail: mocks.sendPgPhotosEmail,
}));

import { prisma } from "@/lib/db";
import { POST as tokenRoute } from "@/app/oauth/token/route";
import { POST as login } from "@/app/api/mobile/v1/auth/login/route";
import { DELETE as mobileStop, GET as mobileFaceMatching } from "@/app/api/mobile/v1/me/registrations/[rsvpId]/face-matching/route";
import { POST as mobileTicket } from "@/app/api/mobile/v1/me/registrations/[rsvpId]/face-matching/ticket/route";
import { POST as statusRoute } from "@/app/api/integrations/pg/v1/enrollments/status/route";
import { POST as withdrawRoute } from "@/app/api/integrations/pg/v1/consents/withdraw/route";
import { POST as notificationsRoute } from "@/app/api/integrations/pg/v1/notifications/route";
import { GET as registrationsRoute } from "@/app/api/integrations/pg/v1/events/[eventId]/registrations/route";
import { attestUnder18, requestSelfieUpload, stopAllFaceMatching, stopFaceMatching, updatePhotoEmailPreference } from "@/app/actions/face-matching";
import { issueSelfieTicket, loadFaceMatchingView, listFaceMatchingForUser, SELFIE_TICKETS_PER_HOUR } from "@/lib/pgIntegration/selfie";
import { FACE_NOTICE_VERSION } from "@/lib/pgIntegration/faceNotice";
import { verifyEnrollmentTicket } from "@/lib/pgIntegration/enrollmentTicket";
import { deliverPgIntegrationBatch } from "@/lib/pgIntegration/delivery";
import { pgEnvelopeSchema } from "@/lib/pgIntegration/contract";
import { deliverOutboxBatch } from "@/lib/outbox";
import { purgeExpiredOperationalData } from "@/lib/retention";
import { pairwiseSubject } from "@/lib/oidc/primitives";
import { decryptOidcSecret } from "@/lib/oidc/secrets";
import { buildClient, registerArgsSchema } from "@/scripts/oauth-register-client";
import { encryptPgIntegrationSecret as cliEncrypt, newSigningSecret } from "@/scripts/pg-integration";

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const ISSUER = "https://yuyu.test";
const PG_PUBLIC = "https://photos.test";
const PASSWORD = "correct horse battery staple";
const HOUR = 3_600_000;
const email = (label: string) => `pgs-${label}-${suffix}@example.test`;

const users = { adult: "", second: "", teen: "", waiting: "", stranger: "", busy: "" };
const ids = { orgA: "", orgB: "", eventA: "", eventB: "", adultRsvp: "", secondRsvp: "", teenRsvp: "", waitingRsvp: "", strangerB: "", busyRsvp: "", guestRsvp: "" };
let client = { id: "", clientId: "", secret: "", salt: "" };
let secret = "";
let bearer = "";
let server: http.Server;
const received: string[] = [];
const subjectOf = (userId: string) => pairwiseSubject(client.salt, userId);
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

function api(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ISSUER}/api/integrations/pg/v1${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "x-real-ip": "203.0.113.31", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function mobile(path: string, token: string, method = "GET", body?: unknown) {
  return new Request(`${ISSUER}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function deliveries(where: { eventType?: string; resourceKey?: string } = {}) {
  return prisma.pgIntegrationDelivery.findMany({ where, orderBy: { seq: "asc" } });
}

/** Delivers every pending row to the local sink and returns the parsed envelopes. */
async function deliverAll() {
  received.length = 0;
  await prisma.pgIntegrationDelivery.updateMany({ where: { status: WebhookDeliveryStatus.PENDING }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await deliverPgIntegrationBatch(200);
  return received.map((body) => pgEnvelopeSchema.parse(JSON.parse(body)));
}

/** Envelope [type, enrollmentId?] pairs for one registration, sorted: PG accepts any delivery order. */
function summary(envelopes: { type: string; data: unknown }[], rsvpId: string) {
  return envelopes
    .filter((envelope) => (envelope.data as { registrationId?: string; registration?: { id: string } }).registrationId === rsvpId)
    .map((envelope) => [envelope.type, (envelope.data as { enrollmentId?: string }).enrollmentId ?? null])
    .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`));
}

async function ticketFor(userId: string, rsvpId: string) {
  // Keep the per-hour cap out of the way of the other scenarios (it has its own test).
  await prisma.pgSelfieTicket.updateMany({ where: { userId }, data: { issuedAt: new Date(Date.now() - 2 * HOUR) } });
  const result = await issueSelfieTicket(userId, rsvpId, { noticeVersion: FACE_NOTICE_VERSION });
  if (!result.ok) throw new Error(`ticket refused: ${result.error}`);
  const verified = verifyEnrollmentTicket(result.ticket, { secrets: [secret], issuer: ISSUER });
  if (!verified.ok) throw new Error(`ticket invalid: ${verified.error}`);
  return { ...result, claims: verified.claims };
}

function event(organisationId: string, slug: string) {
  const start = new Date(Date.now() + 7 * 24 * HOUR);
  return prisma.event.create({ data: {
    organisationId, title: `Summit ${slug}`, slug, timezone: "Asia/Kolkata", location: "Bengaluru",
    startDateTime: start, endDateTime: new Date(start.getTime() + 8 * HOUR), status: EventStatus.PUBLISHED, privacyType: EventPrivacyType.PUBLIC,
    page: { create: { isPublished: true } },
  } });
}

const rsvp = (eventId: string, userId: string, status: RsvpStatus = RsvpStatus.CONFIRMED) =>
  prisma.rSVP.create({ data: { eventId, userId, attendeeKey: `user:${userId}`, status } });

describe.sequential("People's Gallery selfie step and notifications", () => {
  beforeAll(async () => {
    process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS = "1";
    server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received.push(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(204);
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const sinkUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/integrations/yuyu/events`;

    const [orgA, orgB] = await Promise.all([
      prisma.organisation.create({ data: { name: "PGS A", slug: `pgs-a-${suffix}` } }),
      prisma.organisation.create({ data: { name: "PGS B", slug: `pgs-b-${suffix}` } }),
    ]);
    Object.assign(ids, { orgA: orgA.id, orgB: orgB.id });
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    for (const label of Object.keys(users) as (keyof typeof users)[]) {
      users[label] = (await prisma.user.create({ data: { name: `PGS ${label}`, email: email(label), emailVerified: new Date(), passwordHash } })).id;
    }

    const args = registerArgsSchema.parse({ name: "People's Gallery", redirectUris: ["http://localhost:8080/cb"], scopes: "openid profile yuyu.events", firstParty: true });
    const built = buildClient(args, process.env.MFA_ENCRYPTION_KEY);
    const row = await prisma.oAuthClient.create({ data: { ...built.data, allowedScopes: [...built.data.allowedScopes, "yuyu.integration"] }, select: { id: true } });
    client = { id: row.id, clientId: built.data.clientId, secret: built.clientSecret!, salt: decryptOidcSecret(built.data.pairwiseSaltEncrypted) };
    for (const userId of Object.values(users)) {
      await prisma.oAuthGrant.create({ data: { userId, clientId: client.id, scopes: ["openid", "profile"], subject: subjectOf(userId) } });
    }

    secret = newSigningSecret();
    await prisma.pgIntegration.create({
      data: { oauthClientId: client.id, endpointUrl: sinkUrl, allowInternalTarget: true, publicUrl: PG_PUBLIC, secretEncrypted: cliEncrypt(secret, process.env.MFA_ENCRYPTION_KEY) },
    });
    await prisma.pgIntegrationOrganisation.create({ data: { organisationId: ids.orgA, integrationId: "default" } });

    const [a, b] = [await event(ids.orgA, `a-${suffix}`), await event(ids.orgB, `b-${suffix}`)];
    ids.eventA = a.id;
    ids.eventB = b.id;
    ids.adultRsvp = (await rsvp(a.id, users.adult)).id;
    ids.secondRsvp = (await rsvp(a.id, users.second)).id;
    ids.teenRsvp = (await rsvp(a.id, users.teen)).id;
    ids.busyRsvp = (await rsvp(a.id, users.busy)).id;
    ids.waitingRsvp = (await rsvp(a.id, users.waiting, RsvpStatus.WAITLISTED)).id;
    ids.strangerB = (await rsvp(b.id, users.stranger)).id;
    ids.guestRsvp = (await prisma.rSVP.create({ data: { eventId: a.id, guestName: "Guest", guestEmail: email("guest"), attendeeKey: `guest:${email("guest")}`, status: RsvpStatus.CONFIRMED } })).id;

    const response = await tokenRoute(new Request(`${ISSUER}/oauth/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-real-ip": "203.0.113.30",
        authorization: `Basic ${Buffer.from(`${client.clientId}:${client.secret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "yuyu.integration" }).toString(),
    }));
    expect(response.status).toBe(200);
    bearer = ((await response.json()) as { access_token: string }).access_token;
    // Start from a clean delivery queue (event/registration captures from the setup).
    await prisma.pgIntegrationDelivery.deleteMany({});
  });

  afterAll(async () => {
    await prisma.pgIntegration.deleteMany({});
    await prisma.pgIntegrationDelivery.deleteMany({});
    await prisma.pgIntegrationResource.deleteMany({});
    await prisma.pgNotificationReceipt.deleteMany({ where: { eventId: { in: [ids.eventA, ids.eventB] } } });
    await prisma.outboxMessage.deleteMany({ where: { kind: "pg-photos" } });
    await prisma.organisation.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB] } } });
    await prisma.oAuthClient.deleteMany({ where: { id: client.id } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS;
  });

  beforeEach(() => {
    identity.id = "";
    mocks.sendPgPhotosEmail.mockClear();
  });

  it("offers the step only to the owner of a confirmed registration in an organisation shared with PG", async () => {
    expect(await loadFaceMatchingView(users.adult, ids.adultRsvp)).toMatchObject({ available: true, rsvpId: ids.adultRsvp, state: { active: false, selfieState: "NONE", ageAttestation: null } });
    expect(await loadFaceMatchingView(users.second, ids.adultRsvp)).toEqual({ available: false, reason: "not_found" });
    expect(await loadFaceMatchingView(users.waiting, ids.waitingRsvp)).toEqual({ available: false, reason: "not_confirmed" });
    expect(await loadFaceMatchingView(users.stranger, ids.strangerB)).toEqual({ available: false, reason: "not_enabled" });
    // Without PG's public origin there is nowhere to upload: the step is off.
    await prisma.pgIntegration.update({ where: { id: "default" }, data: { publicUrl: null } });
    expect(await loadFaceMatchingView(users.adult, ids.adultRsvp)).toEqual({ available: false, reason: "not_enabled" });
    await prisma.pgIntegration.update({ where: { id: "default" }, data: { publicUrl: PG_PUBLIC } });
  });

  it("needs explicit consent and the 18+ attestation in the request before minting anything", async () => {
    identity.id = users.adult;
    for (const input of [
      { rsvpId: ids.adultRsvp, noticeVersion: FACE_NOTICE_VERSION, consent: false, adult: true },
      { rsvpId: ids.adultRsvp, noticeVersion: FACE_NOTICE_VERSION, consent: true },
      { rsvpId: ids.adultRsvp, noticeVersion: "pg-face-old", consent: true, adult: true },
    ]) {
      expect(await requestSelfieUpload(input)).toMatchObject({ ok: false });
    }
    expect(await prisma.pgFaceConsent.count({ where: { rsvpId: ids.adultRsvp } })).toBe(0);
    expect(await prisma.pgSelfieTicket.count({ where: { userId: users.adult } })).toBe(0);
    // Someone else's registration looks like no registration.
    expect(await requestSelfieUpload({ rsvpId: ids.secondRsvp, noticeVersion: FACE_NOTICE_VERSION, consent: true, adult: true })).toEqual({ ok: false, error: "We couldn't find that registration on your account." });
  });

  it("records consent and mints a 10-minute single-use ticket for an upload straight to PG", async () => {
    identity.id = users.adult;
    const result = await requestSelfieUpload({ rsvpId: ids.adultRsvp, noticeVersion: FACE_NOTICE_VERSION, consent: true, adult: true });
    expect(result.ok).toBe(true);
    const data = result.ok ? result.data! : null;
    expect(data?.uploadUrl).toBe(`${PG_PUBLIC}/api/v2/integrations/yuyu/selfies`);
    expect(data?.action).toBe("add");
    const verified = verifyEnrollmentTicket(data!.ticket, { secrets: [secret], issuer: ISSUER });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.claims).toMatchObject({
      sub: subjectOf(users.adult), org: ids.orgA, evt: ids.eventA, reg: ids.adultRsvp, occ: null,
      pur: "face_matching", nv: FACE_NOTICE_VERSION, age: "adult", act: "add",
    });
    expect(verified.claims.exp - verified.claims.iat).toBe(600);
    // Another integration secret cannot verify it.
    expect(verifyEnrollmentTicket(data!.ticket, { secrets: [newSigningSecret()], issuer: ISSUER })).toEqual({ ok: false, error: "bad_signature" });

    const consent = await prisma.pgFaceConsent.findUniqueOrThrow({ where: { rsvpId: ids.adultRsvp } });
    expect(consent).toMatchObject({ userId: users.adult, ageAttestation: "ADULT", noticeVersion: FACE_NOTICE_VERSION, withdrawnAt: null, selfieState: "PENDING", enrollmentId: null });
    // Only the jti is kept, never the ticket.
    const tickets = await prisma.pgSelfieTicket.findMany({ where: { consentId: consent.id } });
    expect(tickets.map((ticket) => ticket.jti)).toEqual([verified.claims.jti]);
    expect(JSON.stringify(tickets)).not.toContain(data!.ticket.split(".")[2]);

    const granted = (await deliverAll()).find((envelope) => envelope.type === "consent.granted");
    expect(granted).toMatchObject({ type: "consent.granted", organisation: { id: ids.orgA }, data: { registrationId: ids.adultRsvp, subject: subjectOf(users.adult), purpose: "face_matching", noticeVersion: FACE_NOTICE_VERSION } });
    expect(await prisma.auditEvent.count({ where: { action: "PG_FACE_CONSENT_GRANTED", targetId: ids.adultRsvp } })).toBe(1);

    // A second ticket under the same consent is not a new grant.
    await ticketFor(users.adult, ids.adultRsvp);
    expect(await deliveries({ eventType: "consent.granted" })).toHaveLength(1);
  });

  it("applies PG's status callbacks once per ticket and mirrors them as selfie.* events", async () => {
    const consent = await prisma.pgFaceConsent.findUniqueOrThrow({ where: { rsvpId: ids.adultRsvp } });
    const [first] = await prisma.pgSelfieTicket.findMany({ where: { consentId: consent.id }, orderBy: { issuedAt: "asc" } });
    const added = { state: "added", registrationId: ids.adultRsvp, subject: subjectOf(users.adult), enrollmentId: "enr_one", jti: first!.jti, reason: null };

    // Wrong subject, unknown jti, bad body, a query string: nothing changes.
    expect((await statusRoute(api("/enrollments/status", { ...added, subject: subjectOf(users.second) }))).status).toBe(404);
    expect((await statusRoute(api("/enrollments/status", { ...added, jti: `yet_${"0".repeat(32)}` }))).status).toBe(404);
    expect((await statusRoute(api("/enrollments/status", { ...added, imageUrl: "https://x" }))).status).toBe(400);
    expect((await statusRoute(api("/enrollments/status", "{", { "content-type": "application/json" }))).status).toBe(400);
    expect((await statusRoute(new Request(`${ISSUER}/api/integrations/pg/v1/enrollments/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(added) }))).status).toBe(401);

    const ok = await statusRoute(api("/enrollments/status", added));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ data: { selfieState: "ADDED" } });
    // An identical replay is harmless; the same ticket for another enrollment is refused.
    expect((await statusRoute(api("/enrollments/status", added))).status).toBe(200);
    const reused = await statusRoute(api("/enrollments/status", { ...added, enrollmentId: "enr_other" }));
    expect(reused.status).toBe(409);
    expect(await reused.json()).toMatchObject({ error: { code: "TICKET_USED" } });

    expect(await prisma.pgFaceConsent.findUniqueOrThrow({ where: { rsvpId: ids.adultRsvp } })).toMatchObject({ selfieState: "ADDED", enrollmentId: "enr_one" });
    const envelopes = (await deliverAll()).filter((envelope) => envelope.type.startsWith("selfie."));
    expect(envelopes.map((envelope) => envelope.type)).toEqual(["selfie.added"]);
    expect(envelopes[0]!.data).toEqual({ registrationId: ids.adultRsvp, subject: subjectOf(users.adult), enrollmentId: "enr_one" });

    // A rejected retake keeps the selfie that works.
    const retake = await ticketFor(users.adult, ids.adultRsvp);
    expect(retake.action).toBe("replace");
    const rejected = await statusRoute(api("/enrollments/status", { state: "rejected", registrationId: ids.adultRsvp, subject: subjectOf(users.adult), enrollmentId: "enr_rej", jti: retake.claims.jti, reason: "no_face" }));
    expect(await rejected.json()).toEqual({ data: { selfieState: "ADDED" } });

    // A successful replacement removes the old enrollment and adds the new one.
    const replace = await ticketFor(users.adult, ids.adultRsvp);
    expect((await statusRoute(api("/enrollments/status", { ...added, enrollmentId: "enr_two", jti: replace.claims.jti }))).status).toBe(200);
    const after = await deliverAll();
    expect(summary(after, ids.adultRsvp)).toEqual([["selfie.added", "enr_two"], ["selfie.removed", "enr_one"]]);
    const versions = (await deliveries({ resourceKey: `selfie:${ids.adultRsvp}` })).map((row) => Number(row.resourceVersion));
    expect([...versions].sort((x, y) => x - y)).toEqual(versions);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("caps tickets at five an hour per person", async () => {
    for (let index = 0; index < SELFIE_TICKETS_PER_HOUR; index += 1) {
      expect(await issueSelfieTicket(users.busy, ids.busyRsvp, { noticeVersion: FACE_NOTICE_VERSION })).toMatchObject({ ok: true });
    }
    expect(await issueSelfieTicket(users.busy, ids.busyRsvp, { noticeVersion: FACE_NOTICE_VERSION })).toEqual({ ok: false, error: "rate_limited" });
  });

  it("withdraws from the ticket: consent.withdrawn and selfie.removed, and late uploads are dropped", async () => {
    const pending = await ticketFor(users.adult, ids.adultRsvp);
    identity.id = users.second;
    expect(await stopFaceMatching({ rsvpId: ids.adultRsvp })).toMatchObject({ ok: false });
    identity.id = users.adult;
    expect(await stopFaceMatching({ rsvpId: ids.adultRsvp })).toEqual({ ok: true });
    expect(await prisma.pgFaceConsent.findUniqueOrThrow({ where: { rsvpId: ids.adultRsvp } })).toMatchObject({ selfieState: "REMOVED", enrollmentId: null, withdrawnAt: expect.any(Date) });
    const envelopes = await deliverAll();
    expect(summary(envelopes, ids.adultRsvp)).toEqual([["consent.withdrawn", null], ["selfie.removed", "enr_two"]]);
    expect(envelopes.find((envelope) => envelope.type === "consent.withdrawn")!.data).toMatchObject({ registrationId: ids.adultRsvp, scope: "event", purpose: "face_matching" });

    // PG accepted an upload with a ticket issued before the withdrawal: Yuyu asks it to drop it.
    const late = await statusRoute(api("/enrollments/status", { state: "added", registrationId: ids.adultRsvp, subject: subjectOf(users.adult), enrollmentId: "enr_late", jti: pending.claims.jti }));
    expect(await late.json()).toEqual({ data: { selfieState: "REMOVED" } });
    const dropped = await deliverAll();
    expect(summary(dropped, ids.adultRsvp)).toEqual([["selfie.removed", "enr_late"]]);
    expect(await loadFaceMatchingView(users.adult, ids.adultRsvp)).toMatchObject({ state: { active: false, withdrawn: true } });
  });

  it("blocks enrollment after an under-18 attestation and tells PG the registration is a minor's", async () => {
    identity.id = users.teen;
    expect(await attestUnder18({ rsvpId: ids.teenRsvp })).toEqual({ ok: true });
    expect(await issueSelfieTicket(users.teen, ids.teenRsvp, { noticeVersion: FACE_NOTICE_VERSION })).toEqual({ ok: false, error: "minor" });
    expect(await prisma.pgSelfieTicket.count({ where: { userId: users.teen } })).toBe(0);
    // The database refuses a grant on a minor's record whatever the code does.
    await expect(prisma.pgFaceConsent.update({ where: { rsvpId: ids.teenRsvp }, data: { grantedAt: new Date(), noticeVersion: FACE_NOTICE_VERSION } })).rejects.toThrow();

    const updated = (await deliverAll()).find((envelope) => envelope.type === "registration.updated");
    expect(updated).toMatchObject({ type: "registration.updated", data: { registration: { id: ids.teenRsvp, isMinor: true } } });
    const list = await registrationsRoute(new Request(`${ISSUER}/api/integrations/pg/v1/events/${ids.eventA}/registrations`, { headers: { authorization: `Bearer ${bearer}`, "x-real-ip": "203.0.113.32" } }), params({ eventId: ids.eventA }));
    const body = (await list.json()) as { data: { registration: { id: string; isMinor: boolean } }[] };
    expect(body.data.find((item) => item.registration.id === ids.teenRsvp)?.registration.isMinor).toBe(true);
    expect(body.data.find((item) => item.registration.id === ids.adultRsvp)?.registration.isMinor).toBe(false);
  });

  it("serves the step to the Yuyu app with strict DTOs", async () => {
    const signIn = await login(new Request(`${ISSUER}/api/mobile/v1/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email("second"), password: PASSWORD, deviceName: "Test phone", platform: "android" }),
    }), params({}));
    const token = ((await signIn.json()).data as { accessToken: string }).accessToken;
    const path = `/api/mobile/v1/me/registrations/${ids.secondRsvp}/face-matching`;

    const view = await mobileFaceMatching(mobile(path, token), params({ rsvpId: ids.secondRsvp }));
    expect(view.status).toBe(200);
    const viewBody = (await view.json()) as { data: { available: boolean; notice: { version: string }; state: { selfieState: string } } };
    expect(viewBody.data).toMatchObject({ available: true, notice: { version: FACE_NOTICE_VERSION }, state: { selfieState: "NONE" } });
    expect((await mobileFaceMatching(mobile(`/api/mobile/v1/me/registrations/${ids.adultRsvp}/face-matching`, token), params({ rsvpId: ids.adultRsvp }))).status).toBe(404);

    expect((await mobileTicket(mobile(`${path}/ticket`, token, "POST", { noticeVersion: FACE_NOTICE_VERSION, consent: true, adult: false }), params({ rsvpId: ids.secondRsvp }))).status).toBe(400);
    expect((await mobileTicket(mobile(`${path}/ticket`, token, "POST", { noticeVersion: "pg-face-old", consent: true, adult: true }), params({ rsvpId: ids.secondRsvp }))).status).toBe(409);
    const ticket = await mobileTicket(mobile(`${path}/ticket`, token, "POST", { noticeVersion: FACE_NOTICE_VERSION, consent: true, adult: true }), params({ rsvpId: ids.secondRsvp }));
    expect(ticket.status).toBe(200);
    const ticketBody = (await ticket.json()) as { data: { ticket: string; uploadUrl: string; action: string } };
    expect(ticketBody.data.uploadUrl).toBe(`${PG_PUBLIC}/api/v2/integrations/yuyu/selfies`);
    expect(verifyEnrollmentTicket(ticketBody.data.ticket, { secrets: [secret], issuer: ISSUER })).toMatchObject({ ok: true, claims: { reg: ids.secondRsvp, sub: subjectOf(users.second) } });

    expect((await mobileStop(mobile(path, token, "DELETE"), params({ rsvpId: ids.secondRsvp }))).status).toBe(200);
    expect(await prisma.pgFaceConsent.findUniqueOrThrow({ where: { rsvpId: ids.secondRsvp } })).toMatchObject({ withdrawnAt: expect.any(Date) });
    await deliverAll();
  });

  it("applies a withdrawal made in PG, for one event or everywhere", async () => {
    await ticketFor(users.adult, ids.adultRsvp); // consent again after the earlier withdrawal
    await deliverAll();
    expect((await withdrawRoute(api("/consents/withdraw", { subject: subjectOf(users.second), scope: "event", registrationId: ids.adultRsvp }))).status).toBe(404);
    expect((await withdrawRoute(api("/consents/withdraw", { subject: subjectOf(users.adult), scope: "event" }))).status).toBe(400);

    const one = await withdrawRoute(api("/consents/withdraw", { subject: subjectOf(users.adult), scope: "event", registrationId: ids.adultRsvp }));
    expect(await one.json()).toEqual({ data: { withdrawn: 1 } });
    // Repeated: idempotent.
    expect(await (await withdrawRoute(api("/consents/withdraw", { subject: subjectOf(users.adult), scope: "event", registrationId: ids.adultRsvp }))).json()).toEqual({ data: { withdrawn: 0 } });

    await ticketFor(users.adult, ids.adultRsvp);
    await deliverAll();
    const all = await withdrawRoute(api("/consents/withdraw", { subject: subjectOf(users.adult), scope: "all", registrationId: null }));
    expect(await all.json()).toEqual({ data: { withdrawn: 1 } });
    const envelopes = await deliverAll();
    const everywhere = envelopes.find((envelope) => envelope.type === "consent.withdrawn");
    expect(everywhere).toMatchObject({ organisation: null, data: { registrationId: null, scope: "all", subject: subjectOf(users.adult) } });
    expect(await prisma.auditEvent.count({ where: { action: "PG_FACE_CONSENT_WITHDRAWN", targetId: users.adult } })).toBe(1);

    // Account → Privacy lists own rows only.
    const rows = await listFaceMatchingForUser(users.adult);
    expect(rows.map((row) => row.rsvpId)).toEqual([ids.adultRsvp]);
    identity.id = users.adult;
    expect(await stopAllFaceMatching()).toEqual({ ok: true, data: { withdrawn: 0 } });
    await deliverAll();
  });

  describe("attendee notifications", () => {
    const key = () => `pgn_${randomUUID().replaceAll("-", "")}`;
    const body = (recipients: { registrationId: string; subject: string; photosOfYou?: number }[], extra: Record<string, unknown> = {}) => ({
      eventId: ids.eventA, occurrenceId: null, kind: "photos_ready", link: `${PG_PUBLIC}/app/events/e1/photos`,
      recipients: recipients.map((recipient) => ({ registrationId: recipient.registrationId, subject: recipient.subject, counts: { photosOfYou: recipient.photosOfYou ?? 23, newSinceLast: recipient.photosOfYou ?? 23 } })),
      ...extra,
    });

    beforeAll(async () => {
      await ticketFor(users.adult, ids.adultRsvp); // active consent again
      await prisma.outboxMessage.deleteMany({ where: { kind: "pg-photos" } });
    });

    it("queues emails for consenting, confirmed recipients and explains every skip", async () => {
      const idempotencyKey = key();
      const request = body([
        { registrationId: ids.adultRsvp, subject: subjectOf(users.adult) },
        { registrationId: ids.adultRsvp, subject: subjectOf(users.adult) },
        { registrationId: ids.secondRsvp, subject: subjectOf(users.adult) }, // someone else's subject
        { registrationId: ids.secondRsvp, subject: subjectOf(users.second) }, // withdrew
        { registrationId: ids.waitingRsvp, subject: subjectOf(users.waiting) },
        { registrationId: ids.strangerB, subject: subjectOf(users.stranger) }, // another event
        { registrationId: ids.guestRsvp, subject: subjectOf(users.adult) },
      ]);
      const response = await notificationsRoute(api("/notifications", request, { "idempotency-key": idempotencyKey }));
      expect(response.status).toBe(202);
      const answer = await response.json();
      expect(answer).toEqual({ data: { accepted: 1, skipped: [
        { registrationId: ids.adultRsvp, reason: "duplicate" },
        { registrationId: ids.secondRsvp, reason: "not_found" },
        { registrationId: ids.secondRsvp, reason: "duplicate" },
        { registrationId: ids.waitingRsvp, reason: "not_confirmed" },
        { registrationId: ids.strangerB, reason: "not_found" },
        { registrationId: ids.guestRsvp, reason: "not_found" },
      ] } });
      const queued = await prisma.outboxMessage.findMany({ where: { kind: "pg-photos" } });
      expect(queued).toHaveLength(1);
      // Ids and counts only: no address, no subject.
      expect(queued[0]!.payload).toEqual({ userId: users.adult, rsvpId: ids.adultRsvp, eventId: ids.eventA, kind: "photos_ready", photosOfYou: 23, newSinceLast: 23, link: `${PG_PUBLIC}/app/events/e1/photos` });

      // The same key and body: the stored answer, nothing queued again.
      const replay = await notificationsRoute(api("/notifications", request, { "idempotency-key": idempotencyKey }));
      expect(replay.status).toBe(202);
      expect(await replay.json()).toEqual(answer);
      expect(await prisma.outboxMessage.count({ where: { kind: "pg-photos" } })).toBe(1);
      // The same key with another body is a conflict.
      const conflict = await notificationsRoute(api("/notifications", { ...request, kind: "photos_published" }, { "idempotency-key": idempotencyKey }));
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });

      const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: "PG_NOTIFICATION_ACCEPTED", targetId: ids.eventA } });
      expect(audit.metadata).toEqual({ kind: "photos_ready", accepted: 1, skipped: 6 });
    });

    it("sends the email as Yuyu on behalf of People's Gallery, re-checking consent at send time", async () => {
      await prisma.outboxMessage.updateMany({ where: { kind: "pg-photos" }, data: { availableAt: new Date(Date.now() - 1000) } });
      await deliverOutboxBatch(50);
      expect(mocks.sendPgPhotosEmail).toHaveBeenCalledTimes(1);
      expect(mocks.sendPgPhotosEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: email("adult"), subject: `Your 23 photos from Summit a-${suffix} are ready`, ready: true, link: `${PG_PUBLIC}/app/events/e1/photos`,
      }));
      expect(await prisma.outboxMessage.findFirst({ where: { kind: "pg-photos" } })).toMatchObject({ status: OutboxStatus.SENT });

      // Queued, then the person stopped face matching: nothing is sent and the row goes away.
      await prisma.outboxMessage.deleteMany({ where: { kind: "pg-photos" } });
      await notificationsRoute(api("/notifications", body([{ registrationId: ids.adultRsvp, subject: subjectOf(users.adult), photosOfYou: 2 }], { kind: "photos_published" }), { "idempotency-key": key() }));
      identity.id = users.adult;
      await stopFaceMatching({ rsvpId: ids.adultRsvp });
      mocks.sendPgPhotosEmail.mockClear();
      await prisma.outboxMessage.updateMany({ where: { kind: "pg-photos" }, data: { availableAt: new Date(Date.now() - 1000) } });
      await deliverOutboxBatch(50);
      expect(mocks.sendPgPhotosEmail).not.toHaveBeenCalled();
      expect(await prisma.outboxMessage.count({ where: { kind: "pg-photos" } })).toBe(0);
      await deliverAll();
    });

    it("honours the email preference", async () => {
      await ticketFor(users.adult, ids.adultRsvp);
      identity.id = users.adult;
      expect(await updatePhotoEmailPreference({ pgPhotosEmail: false })).toEqual({ ok: true });
      const response = await notificationsRoute(api("/notifications", body([{ registrationId: ids.adultRsvp, subject: subjectOf(users.adult) }]), { "idempotency-key": key() }));
      expect(await response.json()).toEqual({ data: { accepted: 0, skipped: [{ registrationId: ids.adultRsvp, reason: "unsubscribed" }] } });
      expect(await updatePhotoEmailPreference({ pgPhotosEmail: true })).toEqual({ ok: true });
      await deliverAll();
    });

    it("refuses foreign links, other tenants' events, missing keys and loose bodies", async () => {
      const recipients = [{ registrationId: ids.adultRsvp, subject: subjectOf(users.adult) }];
      const cases: [unknown, Record<string, string>, number][] = [
        [body(recipients, { link: "https://evil.test/app/events/e1/photos" }), { "idempotency-key": key() }, 400],
        [body(recipients, { link: "http://photos.test/app" }), { "idempotency-key": key() }, 400],
        [body(recipients, { eventId: ids.eventB }), { "idempotency-key": key() }, 404],
        [body(recipients), {}, 400],
        [body(recipients), { "idempotency-key": "nope" }, 400],
        [{ ...body(recipients), email: "x@example.test" }, { "idempotency-key": key() }, 400],
        [body([{ registrationId: ids.adultRsvp, subject: subjectOf(users.adult), photosOfYou: 0 }]), { "idempotency-key": key() }, 400],
      ];
      for (const [payload, headers, status] of cases) {
        expect((await notificationsRoute(api("/notifications", payload, headers))).status).toBe(status);
      }
      expect(await prisma.outboxMessage.count({ where: { kind: "pg-photos" } })).toBe(0);
    });
  });

  it("purges spent tickets after a day and receipts after a week", async () => {
    const now = new Date(Date.now() + 8 * 24 * HOUR);
    const result = await purgeExpiredOperationalData(now);
    expect(result.pgSelfieTickets).toBeGreaterThan(0);
    expect(result.pgNotificationReceipts).toBeGreaterThan(0);
    expect(await prisma.pgSelfieTicket.count({ where: { userId: users.adult } })).toBe(0);
  });
});
