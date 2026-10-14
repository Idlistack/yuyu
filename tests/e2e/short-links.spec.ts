import { randomUUID } from "node:crypto";
import { EventPrivacyType, EventStatus, PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "");
const orgSlug = `short-links-${suffix}`;
const eventSlug = `short-link-event-${suffix}`;
// Hex suffixes are lowercase, so a leading capital gives each code the shape
// of a real short code while keeping it unique to this run.
const publishedCode = `Q${suffix.slice(0, 6)}`;
const draftCode = `D${suffix.slice(0, 6)}`;
const unknownCode = `Z${suffix.slice(0, 6)}`;
let organisationId = "";

function eventData(slug: string, shortCode: string, status: EventStatus) {
  return {
    organisationId,
    title: `Short link ${slug}`,
    slug,
    shortCode,
    startDateTime: new Date("2035-01-01T10:00:00.000Z"),
    endDateTime: new Date("2035-01-01T12:00:00.000Z"),
    timezone: "UTC",
    status,
    privacyType: EventPrivacyType.PUBLIC,
    page: { create: { isPublished: true } },
  };
}

test.beforeAll(async () => {
  const organisation = await prisma.organisation.create({ data: { name: `Short links ${suffix}`, slug: orgSlug } });
  organisationId = organisation.id;
  await prisma.event.create({ data: eventData(eventSlug, publishedCode, EventStatus.PUBLISHED) });
  await prisma.event.create({ data: eventData(`draft-${suffix}`, draftCode, EventStatus.DRAFT) });
});

test.afterAll(async () => {
  if (organisationId) await prisma.organisation.delete({ where: { id: organisationId } });
  await prisma.$disconnect();
});

test("a published event's short code temporarily redirects to its canonical page", async ({ request }) => {
  const response = await request.get(`/${publishedCode}`, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location, "http://localhost").pathname).toBe(`/${orgSlug}/${eventSlug}`);

  const followed = await request.get(`/${publishedCode}`);
  expect(followed.status()).toBe(200);
  expect(new URL(followed.url()).pathname).toBe(`/${orgSlug}/${eventSlug}`);
});

test("unknown and unpublished codes are an ordinary not-found", async ({ request }) => {
  for (const code of [unknownCode, draftCode]) {
    const response = await request.get(`/${code}`, { maxRedirects: 0 });
    expect(response.status(), code).toBe(404);
    expect(await response.text(), code).not.toContain(`draft-${suffix}`);
  }
});
