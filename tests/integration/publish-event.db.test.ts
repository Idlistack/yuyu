import { randomUUID } from "node:crypto";
import { EventPrivacyType, EventStatus, MembershipRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { publishEvent } from "@/app/actions/event";

const suffix = randomUUID().replace(/-/g, "");
let orgId: string;
let orgSlug: string;
let ownerId: string;
let memberId: string;
let eventCounter = 0;

async function makeDraft(page: boolean | null) {
  eventCounter += 1;
  const event = await prisma.event.create({
    data: {
      organisationId: orgId,
      title: `Publish event ${eventCounter}`,
      slug: `publish-${eventCounter}-${suffix}`,
      startDateTime: new Date("2030-01-01T10:00:00.000Z"),
      endDateTime: new Date("2030-01-01T11:00:00.000Z"),
      timezone: "UTC",
      status: EventStatus.DRAFT,
      privacyType: EventPrivacyType.PUBLIC,
    },
  });
  if (page !== null) await prisma.eventPage.create({ data: { eventId: event.id, isPublished: page, tagline: "Kept" } });
  return event;
}

const stored = (eventId: string) =>
  prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { status: true, page: { select: { isPublished: true, tagline: true } } } });

beforeAll(async () => {
  orgSlug = `publish-org-${suffix}`;
  const org = await prisma.organisation.create({ data: { name: "Publish org", slug: orgSlug } });
  orgId = org.id;
  const owner = await prisma.user.create({ data: { email: `publish-owner-${suffix}@example.test` } });
  const member = await prisma.user.create({ data: { email: `publish-member-${suffix}@example.test` } });
  ownerId = owner.id;
  memberId = member.id;
  await prisma.membership.createMany({ data: [
    { userId: ownerId, organisationId: orgId, role: MembershipRole.OWNER },
    { userId: memberId, organisationId: orgId, role: MembershipRole.MEMBER },
  ] });
});

afterAll(async () => {
  await prisma.organisation.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  await prisma.$disconnect();
});

describe("publishEvent", () => {
  it("releases the unreleased website of a draft, keeping its content", async () => {
    const event = await makeDraft(false);
    identity.id = ownerId;
    expect(await publishEvent({ organisationSlug: orgSlug, eventSlug: event.slug })).toEqual({ ok: true });
    expect(await stored(event.id)).toEqual({ status: EventStatus.PUBLISHED, page: { isPublished: true, tagline: "Kept" } });
  });

  it("creates a released website when the draft has none", async () => {
    const event = await makeDraft(null);
    identity.id = ownerId;
    expect(await publishEvent({ organisationSlug: orgSlug, eventSlug: event.slug })).toEqual({ ok: true });
    expect((await stored(event.id)).page?.isPublished).toBe(true);
  });

  it("leaves both status and website untouched for a member without publish rights", async () => {
    const event = await makeDraft(false);
    identity.id = memberId;
    expect(await publishEvent({ organisationSlug: orgSlug, eventSlug: event.slug })).toMatchObject({ ok: false });
    expect(await stored(event.id)).toEqual({ status: EventStatus.DRAFT, page: { isPublished: false, tagline: "Kept" } });
  });
});
