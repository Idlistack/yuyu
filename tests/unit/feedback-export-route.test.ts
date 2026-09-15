import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  audit: vi.fn(),
  event: vi.fn(),
  fields: vi.fn(),
  responses: vi.fn(),
  membership: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/db", () => ({ prisma: {
  event: { findUnique: mocks.event },
  eventFeedbackAnswer: { findMany: mocks.fields },
  eventFeedbackResponse: { findMany: mocks.responses },
} }));
vi.mock("@/lib/permissions", () => ({ getMembership: mocks.membership, isOrgAdmin: mocks.isAdmin }));

import { GET } from "@/app/api/exports/events/[eventId]/feedback/route";

const routeContext = { params: Promise.resolve({ eventId: "event_1" }) };

describe("full feedback CSV export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.event.mockResolvedValue({
      id: "event_1",
      title: "Test Event",
      organisationId: "org_1",
      feedbackForm: { id: "form_1", fields: [{ key: "rating", label: "Rating" }] },
    });
    mocks.membership.mockResolvedValue({ role: "ADMIN" });
    mocks.isAdmin.mockReturnValue(true);
    mocks.fields.mockResolvedValue([{ fieldKey: "rating", fieldLabel: "Rating" }, { fieldKey: "comment", fieldLabel: "Comment" }]);
    mocks.responses
      .mockResolvedValueOnce([{
        id: "response_1",
        submittedAt: new Date("2030-01-02T03:04:05.000Z"),
        answers: [
          { fieldKey: "rating", valueText: null, valueBool: null, valueNumber: 5, valueDate: null },
          { fieldKey: "comment", valueText: "Very useful", valueBool: null, valueNumber: null, valueDate: null },
        ],
      }])
      .mockResolvedValueOnce([]);
  });

  it("does not disclose feedback to a non-admin member", async () => {
    mocks.membership.mockResolvedValue({ role: "MEMBER" });
    mocks.isAdmin.mockReturnValue(false);

    const response = await GET(new Request("https://events.example.test/api/exports/events/event_1/feedback"), routeContext);

    expect(response.status).toBe(404);
    expect(mocks.responses).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("returns every response in an audited private CSV without identity data", async () => {
    const response = await GET(new Request("https://events.example.test/api/exports/events/event_1/feedback"), routeContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="feedback_Test_Event_\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    await expect(response.text()).resolves.toContain("Submitted At,Rating,Comment\n2030-01-02T03:04:05.000Z,5,Very useful");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "FEEDBACK_RESPONSES_EXPORTED", organisationId: "org_1", targetId: "form_1" }));
    expect(mocks.responses).toHaveBeenCalledTimes(2);
  });
});
