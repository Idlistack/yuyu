import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultNameArea } from "@/lib/certificateTemplate";
const mocks = vi.hoisted(() => ({ find: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { eventFeedbackResponse: { findUnique: mocks.find } } }));
vi.mock("@/lib/renderCertificate", () => ({ renderCustomCertificate: mocks.render }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import { GET } from "@/app/api/feedback/certificate/[token]/route";
const token = "a".repeat(64);
const template = { ...defaultNameArea, backgroundKey: "organisations/org_1/certificate-backgrounds/12345678-1234-4123-8123-123456789abc.webp" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.render.mockResolvedValue(Buffer.from("jpeg"));
  mocks.find.mockResolvedValue({
    certificateToken: token, certificateTemplate: template, submittedAt: new Date(),
    rsvp: { status: "CONFIRMED", guestName: "Alex", user: null },
    form: { certificateEnabled: false, certificateTemplate: null, event: { title: "Launch", organisationId: "org_1", organisation: { name: "Community" } } },
  });
});
describe("certificate downloads", () => {
  it("uses the issued snapshot even after the organiser disables certificates", async () => {
    const result = await GET(new Request("https://example.test"), { params: Promise.resolve({ token }) });
    expect(mocks.render).toHaveBeenCalledWith(template, "Alex", "org_1");
    expect(result.headers.get("Content-Type")).toBe("image/jpeg");
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("does not render certificates for missing or ineligible registrations", async () => {
    mocks.find.mockResolvedValue({ certificateToken: token, rsvp: { status: "WAITLISTED" } });
    await expect(GET(new Request("https://example.test"), { params: Promise.resolve({ token }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.render).not.toHaveBeenCalled();
  });
});
