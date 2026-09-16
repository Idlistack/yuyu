import { describe, expect, it } from "vitest";
import { createCalendarInvite, googleCalendarEventUrl } from "@/lib/calendarInvite";

describe("calendar invitations", () => {
  it("folds long UTF-8 content lines without splitting a character", () => {
    const invite = createCalendarInvite({
      title: `Planning ${"é".repeat(80)}`,
      startDateTime: new Date("2030-01-01T10:00:00.000Z"),
      endDateTime: new Date("2030-01-01T11:00:00.000Z"),
      timezone: "Asia/Kolkata",
      uid: "event@example.test",
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    const lines = invite.split("\r\n").filter(Boolean);
    expect(lines.every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
    expect(invite).toContain("END:VCALENDAR\r\n");
  });

  it("creates a prefilled calendar link without a ticket capability", () => {
    const url = new URL(googleCalendarEventUrl({
      title: "Planning review",
      startDateTime: new Date("2030-01-01T10:00:00.000Z"),
      endDateTime: new Date("2030-01-01T11:00:00.000Z"),
      timezone: "Asia/Kolkata",
      location: "Room A",
    }));

    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Planning review");
    expect(url.searchParams.get("dates")).toBe("20300101T100000Z/20300101T110000Z");
    expect(url.searchParams.get("location")).toBe("Room A");
    expect(url.toString()).not.toContain("ticket");
  });
});
