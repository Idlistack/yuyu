import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rateLimit: vi.fn(), organisationFindUnique: vi.fn(), eventFindFirst: vi.fn(),
  trackFindFirst: vi.fn(), speakerCount: vi.fn(), sessionFindFirst: vi.fn(), sessionFindMany: vi.fn(),
  sessionCreate: vi.fn(), speakerDeleteMany: vi.fn(), speakerCreateMany: vi.fn(), transaction: vi.fn(),
  canAccess: vi.fn(), audit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimit }));
vi.mock("@/lib/eventAccess", () => ({ canAccessEvent: mocks.canAccess }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  organisation: { findUnique: mocks.organisationFindUnique },
  event: { findFirst: mocks.eventFindFirst },
  eventScheduleTrack: { findFirst: mocks.trackFindFirst },
  eventSpeaker: { count: mocks.speakerCount },
  eventSession: { findFirst: mocks.sessionFindFirst, findMany: mocks.sessionFindMany },
  $transaction: mocks.transaction,
} }));

import { saveSession } from "@/app/actions/event-website";

const input = {
  organisationSlug: "org", eventId: "event_1", trackId: "track_1", title: "Opening",
  descriptionHtml: "", startDateTime: "2035-01-01T10:00:00.000Z", endDateTime: "2035-01-01T11:00:00.000Z",
  type: "Talk", speakerIds: [], visibility: "PUBLISHED", sortOrder: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
  mocks.rateLimit.mockResolvedValue(false);
  mocks.organisationFindUnique.mockResolvedValue({ id: "org_1", slug: "org" });
  mocks.eventFindFirst.mockResolvedValue({ id: "event_1", slug: "event" });
  mocks.canAccess.mockResolvedValue(true);
  mocks.trackFindFirst.mockResolvedValue({ id: "track_1" });
  mocks.speakerCount.mockResolvedValue(0);
  mocks.sessionFindFirst.mockResolvedValue(null);
  mocks.sessionFindMany.mockResolvedValue([]);
  const tx = {
    eventSession: { create: mocks.sessionCreate },
    eventSessionSpeaker: { deleteMany: mocks.speakerDeleteMany, createMany: mocks.speakerCreateMany },
  };
  mocks.sessionCreate.mockResolvedValue({ id: "session_1" });
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
});

describe("event session track ownership", () => {
  it("saves a session only when its track belongs to the current event", async () => {
    await expect(saveSession(input)).resolves.toEqual({ ok: true, data: { conflictingSessions: [] } });
    expect(mocks.trackFindFirst).toHaveBeenCalledWith({ where: { id: "track_1", eventId: "event_1" }, select: { id: true } });
    expect(mocks.sessionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ trackId: "track_1", eventId: "event_1" }) }));
  });

  it("rejects a track from another event before any session mutation", async () => {
    mocks.trackFindFirst.mockResolvedValue(null);
    await expect(saveSession(input)).resolves.toEqual({ ok: false, error: "Choose a track belonging to this event." });
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });
});
