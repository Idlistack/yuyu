import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));

vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));

import { proxy } from "@/proxy";

beforeEach(() => {
  mocks.checkRateLimit.mockResolvedValue(true);
  process.env.ALLOWED_EMBED_ORIGINS = "https://host.example.test";
});

describe("embedding response headers", () => {
  it("permits framing only on the dedicated embed route", async () => {
    const embedded = await proxy(new NextRequest("https://events.example.test/embed/acme/launch"));
    expect(embedded.headers.get("content-security-policy")).toContain("frame-ancestors https://host.example.test");
    expect(embedded.headers.get("x-frame-options")).toBeNull();

    const eventPage = await proxy(new NextRequest("https://events.example.test/acme/launch"));
    expect(eventPage.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(eventPage.headers.get("x-frame-options")).toBe("DENY");
  });
});
