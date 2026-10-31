import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { EventPermission, EventPrivacyType, EventStatus, MembershipRole, RsvpStatus, WebhookDeliveryStatus } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The People's Gallery integration end to end against PostgreSQL
 * (docs/PG_INTEGRATION.md): trigger capture in the mutation's transaction,
 * signed delivery to a local HTTP sink with retries and dead-lettering,
 * client-credentials tokens, and the backfill API with cursor pagination and
 * tenant isolation.
 */

process.env.REDIS_URL = "";
process.env.NEXT_PUBLIC_BASE_URL = "https://yuyu.test";
process.env.MFA_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/outboxWorker", () => ({ startOutboxWorker: vi.fn() }));

import { prisma } from "@/lib/db";
import { POST as tokenRoute } from "@/app/oauth/token/route";
import { GET as organisationsRoute } from "@/app/api/integrations/pg/v1/organisations/route";
import { GET as eventsRoute } from "@/app/api/integrations/pg/v1/events/route";
import { GET as registrationsRoute } from "@/app/api/integrations/pg/v1/events/[eventId]/registrations/route";
import { GET as eventRolesRoute } from "@/app/api/integrations/pg/v1/events/[eventId]/roles/route";
import { GET as userRolesRoute } from "@/app/api/integrations/pg/v1/users/[subject]/roles/route";
import { publishEvent } from "@/app/actions/event";
import { submitRsvpCore } from "@/lib/rsvpCore";
import { cancelRsvpForUser } from "@/lib/core/rsvpCancel";
import { deleteRsvpForUser } from "@/lib/core/rsvpAdmin";
import { revokeAllSessionsForUser } from "@/lib/core/accountSecurity";
import { revokeConnectedApp } from "@/lib/oidc/provider";
import { pairwiseSubject } from "@/lib/oidc/primitives";
import { decryptOidcSecret } from "@/lib/oidc/secrets";
import { buildClient, registerArgsSchema } from "@/scripts/oauth-register-client";
import { encryptPgIntegrationSecret as cliEncrypt, newSigningSecret } from "@/scripts/pg-integration";
import { PG_DELIVERY_MAX_ATTEMPTS, deliverPgIntegrationBatch } from "@/lib/pgIntegration/delivery";
import { pgEnvelopeSchema, pgDataSchemas } from "@/lib/pgIntegration/contract";
import { verifyWebhookSignature } from "@/lib/webhooks/signature";
import { purgeExpiredOperationalData } from "@/lib/retention";

type Received = { headers: http.IncomingHttpHeaders; body: string };
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const received: Received[] = [];
let respond: number[] = [];
let server: http.Server;
let sinkUrl = "";
let secret = "";

const ids = { orgA: "", orgB: "", orgC: "", owner: "", admin: "", member: "", collaborator: "", attendee: "", stranger: "" };
const slugs = { orgA: `pga-${suffix}`, orgB: `pgb-${suffix}`, orgC: `pgc-${suffix}` };
type Client = { id: string; clientId: string; secret: string; salt: string };
let pgClient: Client;
let otherClient: Client;
let eventA = { id: "", slug: "" };
let eventB = { id: "", slug: "" };

const ISSUER = "https://yuyu.test";
const subjectOf = (userId: string) => pairwiseSubject(pgClient.salt, userId);

async function registerClient(name: string, scopes: string[]): Promise<Client> {
  const args = registerArgsSchema.parse({ name, redirectUris: ["http://localhost:8080/cb"], scopes: "openid profile yuyu.events", firstParty: true });
  const { clientSecret, data } = buildClient(args, process.env.MFA_ENCRYPTION_KEY);
  const row = await prisma.oAuthClient.create({ data: { ...data, allowedScopes: [...data.allowedScopes, ...scopes] }, select: { id: true } });
  return { id: row.id, clientId: data.clientId, secret: clientSecret!, salt: decryptOidcSecret(data.pairwiseSaltEncrypted) };
}

function eventData(organisationId: string, slug: string, status: EventStatus = EventStatus.DRAFT) {
  const start = new Date(Date.now() + 7 * 86_400_000);
  return {
    organisationId, title: `Event ${slug}`, slug, timezone: "Asia/Kolkata", location: "NIMHANS Convention Centre, Bengaluru",
    startDateTime: start, endDateTime: new Date(start.getTime() + 3 * 3_600_000), status, privacyType: EventPrivacyType.PUBLIC,
    page: { create: { isPublished: status === EventStatus.PUBLISHED } },
  };
}

async function rows(where: { eventType?: string; organisationId?: string | null; resourceKey?: string } = {}) {
  return prisma.pgIntegrationDelivery.findMany({ where, orderBy: { seq: "asc" } });
}

async function deliverAll() {
  await prisma.pgIntegrationDelivery.updateMany({ where: { status: WebhookDeliveryStatus.PENDING }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
  return deliverPgIntegrationBatch(200);
}

async function token(client: Client, scope?: string) {
  const response = await tokenRoute(new Request(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-real-ip": "203.0.113.20",
      authorization: `Basic ${Buffer.from(`${client.clientId}:${client.secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials", ...(scope ? { scope } : {}) }).toString(),
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function api(path: string, bearer: string) {
  return new Request(`${ISSUER}/api/integrations/pg/v1${path}`, { headers: { authorization: `Bearer ${bearer}`, "x-real-ip": "203.0.113.21" } });
}
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

describe.sequential("People's Gallery integration", () => {
  beforeAll(async () => {
    process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS = "1";
    server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received.push({ headers: request.headers, body: Buffer.concat(chunks).toString("utf8") });
        response.writeHead(respond.shift() ?? 204);
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    sinkUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/integrations/yuyu/events`;

    const [orgA, orgB, orgC] = await Promise.all([
      prisma.organisation.create({ data: { name: "PG A", slug: slugs.orgA } }),
      prisma.organisation.create({ data: { name: "PG B", slug: slugs.orgB } }),
      prisma.organisation.create({ data: { name: "PG C", slug: slugs.orgC } }),
    ]);
    Object.assign(ids, { orgA: orgA.id, orgB: orgB.id, orgC: orgC.id });
    for (const label of ["owner", "admin", "member", "collaborator", "attendee", "stranger"] as const) {
      const user = await prisma.user.create({ data: { name: `PG ${label}`, email: `pg-${label}-${suffix}@example.test`, emailVerified: new Date() } });
      ids[label] = user.id;
    }
    pgClient = await registerClient("People's Gallery", ["yuyu.integration"]);
    otherClient = await registerClient("Other app", []);

    await prisma.membership.createMany({
      data: [
        { userId: ids.owner, organisationId: ids.orgA, role: MembershipRole.OWNER },
        { userId: ids.owner, organisationId: ids.orgB, role: MembershipRole.OWNER },
      ],
    });
    // An event created before the organisation is enabled is only reachable through the seed.
    await prisma.event.create({ data: eventData(ids.orgC, `pre-${suffix}`) });

    secret = newSigningSecret();
    await prisma.pgIntegration.create({
      data: { oauthClientId: pgClient.id, endpointUrl: sinkUrl, allowInternalTarget: true, secretEncrypted: cliEncrypt(secret, process.env.MFA_ENCRYPTION_KEY) },
    });
    await prisma.pgIntegrationOrganisation.create({ data: { organisationId: ids.orgA, integrationId: "default" } });
    // The attendee and the member linked People's Gallery (OIDC grant).
    for (const userId of [ids.attendee, ids.member]) {
      await prisma.oAuthGrant.create({ data: { userId, clientId: pgClient.id, scopes: ["openid", "profile"], subject: subjectOf(userId) } });
    }
  });

  afterAll(async () => {
    await prisma.pgIntegration.deleteMany({});
    await prisma.pgIntegrationDelivery.deleteMany({});
    await prisma.pgIntegrationResource.deleteMany({});
    await prisma.organisation.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB, ids.orgC] } } });
    await prisma.oAuthClient.deleteMany({ where: { id: { in: [pgClient.id, otherClient.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.owner, ids.admin, ids.member, ids.collaborator, ids.attendee, ids.stranger] } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS;
  });

  beforeEach(() => {
    received.length = 0;
    respond = [];
    identity.id = "";
  });

  it("writes the outbox row in the mutation's transaction, only for enabled organisations", async () => {
    // A rolled-back mutation leaves no delivery behind.
    await expect(prisma.$transaction(async (tx) => {
      await tx.event.create({ data: eventData(ids.orgA, `rollback-${suffix}`) });
      expect(await tx.pgIntegrationDelivery.count({ where: { eventType: "event.created", organisationId: ids.orgA } })).toBe(1);
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await rows({ eventType: "event.created", organisationId: ids.orgA })).toHaveLength(0);

    const created = await prisma.event.create({ data: eventData(ids.orgA, `summit-${suffix}`) });
    eventA = { id: created.id, slug: created.slug };
    const [row] = await rows({ eventType: "event.created", organisationId: ids.orgA });
    expect(row).toMatchObject({ resourceKey: `event:${created.id}:`, status: WebhookDeliveryStatus.PENDING, payload: null });

    const other = await prisma.event.create({ data: eventData(ids.orgB, `other-${suffix}`) });
    eventB = { id: other.id, slug: other.slug };
    expect(await rows({ organisationId: ids.orgB })).toHaveLength(0);
  });

  it("captures publish, cancel and field edits with strictly increasing versions", async () => {
    identity.id = ids.owner;
    expect(await publishEvent({ organisationSlug: slugs.orgA, eventSlug: eventA.slug })).toEqual({ ok: true });
    await prisma.event.update({ where: { id: eventA.id }, data: { title: "Tech4Good Summit 2026" } });
    await prisma.event.update({ where: { id: eventA.id }, data: { capacity: 500 } }); // untracked field: nothing
    const events = await rows({ resourceKey: `event:${eventA.id}:` });
    expect(events.map((row) => row.eventType)).toEqual(["event.created", "event.published", "event.updated"]);
    const versions = events.map((row) => row.resourceVersion);
    expect(versions[1]! > versions[0]! && versions[2]! > versions[1]!).toBe(true);
    expect((events[2]!.snapshot as { changed: string[] }).changed).toEqual(["title"]);
  });

  it("captures registrations with subject only, and cancellations vs removals", async () => {
    const created = await submitRsvpCore({ orgSlug: slugs.orgA, eventSlug: eventA.slug, name: "Praveen Kumar", answers: {} }, { userId: ids.attendee });
    expect(created).toBeTruthy();
    const guest = await submitRsvpCore({ orgSlug: slugs.orgA, eventSlug: eventA.slug, guestEmail: `guest-${suffix}@example.test`, name: "Guest Person", answers: {} }, { userId: null });
    const attendeeRsvp = await prisma.rSVP.findFirstOrThrow({ where: { eventId: eventA.id, userId: ids.attendee } });
    const guestRsvp = await prisma.rSVP.findFirstOrThrow({ where: { eventId: eventA.id, guestEmail: `guest-${suffix}@example.test` } });
    expect(guest).toBeTruthy();
    const createdRows = await rows({ eventType: "registration.created" });
    expect(createdRows.map((row) => row.resourceKey).sort()).toEqual([`registration:${attendeeRsvp.id}`, `registration:${guestRsvp.id}`].sort());
    // The snapshot never holds contact data or capabilities.
    for (const row of createdRows) expect(JSON.stringify(row.snapshot)).not.toMatch(/@example\.test|checkInToken|guestEmail|answers/);

    expect(await cancelRsvpForUser(null, { checkInToken: guestRsvp.checkInToken })).toMatchObject({ ok: true });
    const cancelled = await rows({ resourceKey: `registration:${guestRsvp.id}`, eventType: "registration.status_changed" });
    expect((cancelled[0]!.snapshot as { status: string; previousStatus: string })).toMatchObject({ status: "CANCELLED", previousStatus: "CONFIRMED" });

    const second = await submitRsvpCore({ orgSlug: slugs.orgA, eventSlug: eventA.slug, guestEmail: `removed-${suffix}@example.test`, name: "Removed Person", answers: {} }, { userId: null });
    expect(second).toBeTruthy();
    const removedRsvp = await prisma.rSVP.findFirstOrThrow({ where: { eventId: eventA.id, guestEmail: `removed-${suffix}@example.test` } });
    expect(await deleteRsvpForUser(ids.owner, { organisationSlug: slugs.orgA, eventId: eventA.id, rsvpId: removedRsvp.id })).toMatchObject({ ok: true });
    const removed = await rows({ resourceKey: `registration:${removedRsvp.id}`, eventType: "registration.status_changed" });
    expect((removed[0]!.snapshot as { status: string }).status).toBe("REMOVED");
    // The removal marker is transaction-local: a later cancel in a new transaction is CANCELLED again (checked above).
  });

  it("captures role changes per (person, organisation) and session revocation for linked users", async () => {
    await prisma.membership.create({ data: { userId: ids.member, organisationId: ids.orgA, role: MembershipRole.MEMBER } });
    await prisma.membership.update({ where: { userId_organisationId: { userId: ids.member, organisationId: ids.orgA } }, data: { role: MembershipRole.ADMIN } });
    await prisma.eventCollaborator.create({ data: { eventId: eventA.id, userId: ids.collaborator, permissions: [EventPermission.MANAGE_REGISTRATIONS] } });
    await prisma.eventCollaborator.create({ data: { eventId: eventB.id, userId: ids.collaborator, permissions: [EventPermission.EDIT_DETAILS] } });
    const access = await rows({ eventType: "access.changed" });
    expect(access.map((row) => row.resourceKey)).toEqual([
      `access:${ids.member}:${ids.orgA}`,
      `access:${ids.member}:${ids.orgA}`,
      `access:${ids.collaborator}:${ids.orgA}`,
    ]);
    expect(access[1]!.resourceVersion > access[0]!.resourceVersion).toBe(true);

    await revokeAllSessionsForUser(ids.attendee);
    await revokeAllSessionsForUser(ids.stranger); // never linked PG: nothing
    const grant = await prisma.oAuthGrant.findFirstOrThrow({ where: { userId: ids.member, clientId: pgClient.id } });
    expect(await revokeConnectedApp(ids.member, grant.id)).toBe(true);
    const revoked = await rows({ eventType: "user.sessions_revoked" });
    expect(revoked.map((row) => [row.resourceKey, (row.snapshot as { reason: string }).reason])).toEqual([
      [`user:${ids.attendee}`, "session_version"],
      [`user:${ids.member}`, "grant_revoked"],
    ]);
  });

  it("delivers signed strict envelopes with pairwise subjects and no contact data", async () => {
    const result = await deliverAll();
    expect(result.failed).toBe(0);
    expect(received.length).toBe(result.delivered);
    for (const message of received) {
      expect(message.headers["user-agent"]).toBe("Yuyu-PG-Integration/1");
      expect(verifyWebhookSignature({ secret, header: message.headers["x-yuyu-signature"] as string, body: message.body })).toBe(true);
      const envelope = pgEnvelopeSchema.parse(JSON.parse(message.body));
      expect(message.headers["x-yuyu-event-id"]).toBe(envelope.id);
      expect(message.headers["x-yuyu-event-type"]).toBe(envelope.type);
      pgDataSchemas[envelope.type].parse(envelope.data);
      expect(message.body).not.toMatch(/@example\.test|checkInToken|guestEmail/);
      for (const userId of [ids.attendee, ids.member, ids.collaborator, ids.owner]) expect(message.body).not.toContain(userId);
    }
    const bodies = received.map((message) => pgEnvelopeSchema.parse(JSON.parse(message.body)));
    const registration = bodies.find((body) => body.type === "registration.created" && (body.data.registration as { subject: string | null }).subject);
    expect(registration?.data.registration).toMatchObject({ subject: subjectOf(ids.attendee), displayName: "PG attendee", status: "CONFIRMED", isMinor: false });
    expect(registration?.organisation).toEqual({ id: ids.orgA, slug: slugs.orgA });
    const published = bodies.find((body) => body.type === "event.published");
    expect(published?.data).toMatchObject({ previousStatus: "DRAFT", event: { kind: "event", id: eventA.id, status: "PUBLISHED", location: "NIMHANS Convention Centre, Bengaluru", timezone: "Asia/Kolkata" } });
    const revoked = bodies.filter((body) => body.type === "user.sessions_revoked");
    expect(revoked.every((body) => body.organisation === null)).toBe(true);
    expect(revoked.map((body) => body.data.subject)).toEqual(expect.arrayContaining([subjectOf(ids.attendee), subjectOf(ids.member)]));
    // Built once; the internal snapshot (with user ids) is dropped.
    const delivered = await prisma.pgIntegrationDelivery.findMany({ where: { status: WebhookDeliveryStatus.SUCCEEDED }, select: { snapshot: true } });
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.every((row) => row.snapshot === null)).toBe(true);
  });

  it("retries with the same envelope id, dead-letters permanent failures and exhausted retries", async () => {
    await prisma.event.update({ where: { id: eventA.id }, data: { location: "Bengaluru" } });
    respond = [503];
    expect(await deliverAll()).toEqual({ delivered: 0, failed: 1 });
    const [pending] = await rows({ eventType: "event.updated", resourceKey: `event:${eventA.id}:` }).then((list) => list.filter((row) => row.status === "PENDING"));
    expect(pending).toMatchObject({ attempts: 1, lastStatusCode: 503 });
    expect(pending!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000); // 1 min ± 20 %
    expect(await deliverAll()).toEqual({ delivered: 1, failed: 0 });
    expect(received.map((message) => message.headers["x-yuyu-event-id"])).toEqual([pending!.id, pending!.id]);
    expect(received[0]!.body).toBe(received[1]!.body);

    await prisma.event.update({ where: { id: eventA.id }, data: { location: "Mysuru" } });
    respond = [400];
    await deliverAll();
    const permanent = await prisma.pgIntegrationDelivery.findFirstOrThrow({ where: { lastStatusCode: 400 } });
    expect(permanent).toMatchObject({ status: WebhookDeliveryStatus.FAILED, attempts: 1 });

    await prisma.event.update({ where: { id: eventA.id }, data: { location: "Hubballi" } });
    const last = (await rows({ resourceKey: `event:${eventA.id}:` })).at(-1)!;
    await prisma.pgIntegrationDelivery.update({ where: { id: last.id }, data: { attempts: PG_DELIVERY_MAX_ATTEMPTS - 1 } });
    respond = [500];
    await deliverAll();
    expect(await prisma.pgIntegrationDelivery.findUniqueOrThrow({ where: { id: last.id } })).toMatchObject({ status: WebhookDeliveryStatus.FAILED, attempts: PG_DELIVERY_MAX_ATTEMPTS });
  });

  it("issues client-credentials tokens only to first-party clients holding the scope", async () => {
    const ok = await token(pgClient);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ access_token: expect.stringMatching(/^yoi_/), token_type: "Bearer", expires_in: 600, scope: "yuyu.integration" });
    expect((await token(pgClient, "openid")).body).toMatchObject({ error: "invalid_scope" });
    expect((await token(otherClient)).body).toMatchObject({ error: "unauthorized_client" });
    // A machine token is never a user token.
    const { GET: userinfo } = await import("@/app/oauth/userinfo/route");
    const response = await userinfo(new Request(`${ISSUER}/oauth/userinfo`, { headers: { authorization: `Bearer ${ok.body.access_token}` } }) as never);
    expect(response.status).toBe(401);
  });

  it("serves the backfill API with cursor pagination, tombstones and tenant isolation", async () => {
    const bearer = (await token(pgClient)).body.access_token as string;
    expect((await organisationsRoute(api("/organisations", "yoi_" + "x".repeat(43)))).status).toBe(401);
    const orgs = await (await organisationsRoute(api("/organisations", bearer))).json();
    expect(orgs.data.map((org: { slug: string }) => org.slug)).toEqual([slugs.orgA]);

    // Another client's token, even with the scope, is refused.
    await prisma.oAuthClient.update({ where: { id: otherClient.id }, data: { allowedScopes: { push: "yuyu.integration" } } });
    const otherBearer = (await token(otherClient)).body.access_token as string;
    expect((await eventsRoute(api("/events", otherBearer))).status).toBe(403);

    // A second event in A, then page one at a time.
    const second = await prisma.event.create({ data: eventData(ids.orgA, `second-${suffix}`) });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await eventsRoute(api(`/events?limit=1${cursor ? `&cursor=${cursor}` : ""}`, bearer));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json() as { data: Array<{ event: { id: string }; resourceVersion: number; deleted: boolean }>; pagination: { nextCursor: string | null } };
      expect(body.data.length).toBeLessThanOrEqual(1);
      seen.push(...body.data.map((item) => item.event.id));
      cursor = body.pagination.nextCursor;
    } while (cursor);
    expect(seen.sort()).toEqual([eventA.id, second.id].sort());
    expect((await eventsRoute(api("/events?cursor=not-a-cursor", bearer))).status).toBe(400);
    expect((await eventsRoute(api(`/events?organisationId=${ids.orgB}`, bearer))).status).toBe(404);

    // The resourceVersion served equals the last pushed version.
    const listed = await (await eventsRoute(api(`/events?organisationId=${ids.orgA}&limit=100`, bearer))).json() as { data: Array<{ event: { id: string }; resourceVersion: number }> };
    const lastPushed = (await rows({ resourceKey: `event:${eventA.id}:` })).at(-1)!.resourceVersion;
    expect(listed.data.find((item) => item.event.id === eventA.id)?.resourceVersion).toBe(Number(lastPushed));

    // Tombstone after deletion.
    await prisma.event.delete({ where: { id: second.id } });
    const after = await (await eventsRoute(api("/events?limit=100", bearer))).json() as { data: Array<{ event: { id: string }; deleted: boolean }> };
    expect(after.data.find((item) => item.event.id === second.id)).toMatchObject({ deleted: true, event: { kind: "event", id: second.id, occurrenceId: null } });
    expect(await rows({ eventType: "event.deleted", resourceKey: `event:${second.id}:` })).toHaveLength(1);

    // Registrations: live with subject, guest without, cancelled/removed tombstones; paginated.
    const regs: Array<{ registration: { status: string; subject: string | null; displayName: string } }> = [];
    cursor = null;
    do {
      const response = await registrationsRoute(api(`/events/${eventA.id}/registrations?limit=2${cursor ? `&cursor=${cursor}` : ""}`, bearer), params({ eventId: eventA.id }));
      const body = await response.json() as { data: typeof regs; pagination: { nextCursor: string | null } };
      regs.push(...body.data);
      cursor = body.pagination.nextCursor;
    } while (cursor);
    expect(regs.map((item) => item.registration.status).sort()).toEqual(["CANCELLED", "CONFIRMED", "REMOVED"]);
    expect(regs.find((item) => item.registration.status === "CONFIRMED")?.registration.subject).toBe(subjectOf(ids.attendee));
    expect(JSON.stringify(regs)).not.toMatch(/@example\.test/);
    expect((await registrationsRoute(api(`/events/${eventB.id}/registrations`, bearer), params({ eventId: eventB.id }))).status).toBe(404);

    // Roles for event A with the D-2 mapping.
    const roles = await (await eventRolesRoute(api(`/events/${eventA.id}/roles`, bearer), params({ eventId: eventA.id }))).json() as { data: Array<{ subject: string; pgRole: string | null; orgRole: string | null }> };
    const bySubject = new Map(roles.data.map((item) => [item.subject, item]));
    expect(bySubject.get(subjectOf(ids.owner))).toMatchObject({ orgRole: "OWNER", pgRole: "admin" });
    expect(bySubject.get(subjectOf(ids.member))).toMatchObject({ orgRole: "ADMIN", pgRole: "admin" });
    expect(bySubject.get(subjectOf(ids.collaborator))).toMatchObject({ orgRole: null, pgRole: "viewer" });
    expect((await eventRolesRoute(api(`/events/${eventB.id}/roles`, bearer), params({ eventId: eventB.id }))).status).toBe(404);

    // Per-subject roles: only enabled organisations (the EDIT_DETAILS grant on B's event stays hidden).
    await prisma.oAuthGrant.create({ data: { userId: ids.collaborator, clientId: pgClient.id, scopes: ["openid"] } });
    const userRoles = await (await userRolesRoute(api(`/users/${subjectOf(ids.collaborator)}/roles`, bearer), params({ subject: subjectOf(ids.collaborator) }))).json();
    expect(userRoles.data).toEqual({
      subject: subjectOf(ids.collaborator),
      organisations: [],
      events: [{ organisationId: ids.orgA, eventId: eventA.id, occurrenceId: null, collaboratorPermissions: ["MANAGE_REGISTRATIONS"], registration: null }],
    });
    const attendeeRoles = await (await userRolesRoute(api(`/users/${subjectOf(ids.attendee)}/roles`, bearer), params({ subject: subjectOf(ids.attendee) }))).json();
    expect(attendeeRoles.data.events[0].registration).toMatchObject({ status: RsvpStatus.CONFIRMED, isCrew: false });
    // Unknown subject and a subject whose grant was disconnected are not found.
    expect((await userRolesRoute(api(`/users/${subjectOf(ids.stranger)}/roles`, bearer), params({ subject: subjectOf(ids.stranger) }))).status).toBe(404);
    expect((await userRolesRoute(api(`/users/${subjectOf(ids.member)}/roles`, bearer), params({ subject: subjectOf(ids.member) }))).status).toBe(404);
  });

  it("seeds versions when an organisation is enabled so the backfill sees earlier events", async () => {
    const bearer = (await token(pgClient)).body.access_token as string;
    await prisma.pgIntegrationOrganisation.create({ data: { organisationId: ids.orgC, integrationId: "default" } });
    const [seeded] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT "pg_integration_seed_organisation"(${ids.orgC}) AS "count"`;
    expect(seeded!.count).toBe(1);
    const body = await (await eventsRoute(api(`/events?organisationId=${ids.orgC}`, bearer))).json() as { data: Array<{ event: { slug: string }; resourceVersion: number }> };
    expect(body.data.map((item) => item.event.slug)).toEqual([`pre-${suffix}`]);
    expect(body.data[0]!.resourceVersion).toBeGreaterThan(0);
  });

  it("stops capturing and claiming while the integration is disabled; retention keeps pending rows", async () => {
    await prisma.pgIntegration.update({ where: { id: "default" }, data: { enabled: false } });
    const before = await prisma.pgIntegrationDelivery.count();
    await prisma.event.update({ where: { id: eventA.id }, data: { title: "Paused" } });
    expect(await prisma.pgIntegrationDelivery.count()).toBe(before);
    expect(await deliverPgIntegrationBatch()).toEqual({ delivered: 0, failed: 0 });
    await prisma.pgIntegration.update({ where: { id: "default" }, data: { enabled: true } });

    await prisma.event.update({ where: { id: eventA.id }, data: { title: "Resumed" } });
    await prisma.pgIntegrationDelivery.updateMany({ data: { createdAt: new Date(Date.now() - 40 * 86_400_000) } });
    await purgeExpiredOperationalData();
    expect(await prisma.pgIntegrationDelivery.count({ where: { status: WebhookDeliveryStatus.PENDING } })).toBeGreaterThan(0);
    expect(await prisma.pgIntegrationDelivery.count({ where: { status: { in: [WebhookDeliveryStatus.SUCCEEDED, WebhookDeliveryStatus.FAILED] } } })).toBe(0);
  });
});
