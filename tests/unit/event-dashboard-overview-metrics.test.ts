import { describe, expect, it } from "vitest";
import { eventPhase, readinessHeading, readinessItems, signupTrend, type ReadinessInput } from "@/components/event-dashboard/overview/readiness";
import { busiestDay, dotsFor, funnelSteps, peoplePerDot, signupTimeline, waffleCells } from "@/components/event-dashboard/analytics/metrics";

const DAY = 86_400_000;
const admin = { isAdmin: true, canEditDetails: true, canManageSchedule: true, canManageRegistrations: true };
const base: ReadinessInput = {
  published: true,
  hasCoverImage: true,
  hasAccent: false,
  isOnline: false,
  sessionCount: 4,
  registrationFieldCount: 2,
  stationPinSet: true,
  approvalRequired: false,
  pendingApprovals: 0,
  emailsSent: 1,
  permissions: admin,
};

describe("readinessItems", () => {
  it("marks everything done for a fully prepared event", () => {
    const items = readinessItems(base);
    expect(items.map((item) => item.key)).toEqual(["published", "look", "programme", "form", "pin", "email"]);
    expect(items.every((item) => item.done)).toBe(true);
    expect(items.find((item) => item.key === "programme")?.label).toBe("Programme · 4 sessions");
  });

  it("turns missing pieces into actions", () => {
    const items = readinessItems({ ...base, published: false, hasCoverImage: false, sessionCount: 0, registrationFieldCount: 0, stationPinSet: false, pendingApprovals: 3, emailsSent: 0 });
    const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
    expect(byKey.published?.action).toEqual({ kind: "publish", label: "Publish" });
    expect(byKey.look?.action).toMatchObject({ tab: "page", sub: "details" });
    expect(byKey.programme?.action).toMatchObject({ tab: "page", sub: "page" });
    // Name and email are always collected, so a form without extra questions is not a to-do.
    expect(byKey.form).toMatchObject({ done: true });
    expect(byKey.pin?.action).toMatchObject({ tab: "check-in" });
    expect(byKey.approvals).toMatchObject({ label: "3 waiting for approval", done: false, action: { tab: "guests", sub: "people" } });
    expect(byKey.email?.action).toMatchObject({ tab: "emails" });
  });

  it("counts an accent colour as a finished look and skips the PIN for online events", () => {
    const items = readinessItems({ ...base, hasCoverImage: false, hasAccent: true, isOnline: true });
    expect(items.find((item) => item.key === "look")).toMatchObject({ label: "Page accent colour", done: true });
    expect(items.some((item) => item.key === "pin")).toBe(false);
  });

  it("shows approvals as done only when approval is required", () => {
    expect(readinessItems(base).some((item) => item.key === "approvals")).toBe(false);
    expect(readinessItems({ ...base, approvalRequired: true }).find((item) => item.key === "approvals")?.done).toBe(true);
  });

  it("shows collaborators only what they can act on", () => {
    const items = readinessItems({ ...base, permissions: { isAdmin: false, canEditDetails: false, canManageSchedule: true, canManageRegistrations: false }, pendingApprovals: 5 });
    expect(items.map((item) => item.key)).toEqual(["programme"]);
    expect(readinessItems({ ...base, permissions: { isAdmin: false, canEditDetails: false, canManageSchedule: false, canManageRegistrations: false } })).toEqual([]);
  });
});

describe("readinessHeading", () => {
  const now = new Date("2026-10-14T06:00:00Z");
  const tomorrow = new Date("2026-10-15T13:00:00Z");
  const later = new Date(tomorrow.getTime() + 3 * 3_600_000);

  it("names a near day and counts what is left", () => {
    const items = readinessItems({ ...base, emailsSent: 0, stationPinSet: false });
    const heading = readinessHeading({ items, start: tomorrow, end: later, now, timeZone: "Asia/Kolkata" });
    expect(heading.title).toBe("Almost ready for tomorrow");
    expect(heading.summary).toBe("4 of 6 done. 2 things left · starts tomorrow.");
    expect(heading.complete).toBe(false);
  });

  it("says ready when complete, and stays generic for distant dates", () => {
    const items = readinessItems(base);
    const far = new Date(now.getTime() + 20 * DAY);
    const heading = readinessHeading({ items, start: far, end: new Date(far.getTime() + 3_600_000), now, timeZone: "UTC" });
    expect(heading.title).toBe("Ready");
    expect(heading.complete).toBe(true);
  });

  it("reports a live event as happening now", () => {
    expect(readinessHeading({ items: readinessItems(base), start: new Date(now.getTime() - 1000), end: later, now, timeZone: "UTC" }).title).toBe("Happening now");
  });
});

describe("eventPhase", () => {
  it("classifies upcoming, live and ended", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    expect(eventPhase(new Date("2026-10-15T00:00:00Z"), new Date("2026-10-15T02:00:00Z"), now)).toBe("upcoming");
    expect(eventPhase(new Date("2026-10-14T11:00:00Z"), new Date("2026-10-14T13:00:00Z"), now)).toBe("live");
    expect(eventPhase(new Date("2026-10-13T11:00:00Z"), new Date("2026-10-13T13:00:00Z"), now)).toBe("ended");
  });
});

describe("signupTrend", () => {
  it("counts rolling days and compares the two weeks", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const dates = [
      new Date(now.getTime() - 1000), // last day
      new Date(now.getTime() - 2000),
      new Date(now.getTime() - 3 * DAY), // this week
      new Date(now.getTime() - 10 * DAY), // the week before
      new Date(now.getTime() - 20 * DAY), // outside the window
    ];
    const trend = signupTrend(dates, now);
    expect(trend.counts).toHaveLength(14);
    expect(trend.lastDay).toBe(2);
    expect(trend.total).toBe(4);
    expect(trend.change).toBe("+200% on the week before");
    expect(trend.levels[13]).toBe(6);
  });

  it("has no change hint when nothing happened", () => {
    expect(signupTrend([], new Date()).change).toBeNull();
  });
});

describe("dot scaling", () => {
  it("uses one dot per person until the row is full", () => {
    expect(peoplePerDot(44, 60)).toBe(1);
    expect(peoplePerDot(130, 60)).toBe(3);
    expect(dotsFor(0, 3)).toBe(0);
    expect(dotsFor(1, 3)).toBe(1);
    expect(dotsFor(31, 3)).toBe(10);
  });
});

describe("funnelSteps", () => {
  it("shows after-the-event steps as pending before the event ends", () => {
    const { steps, perDot, total } = funnelSteps({ responded: 44, going: 34, checkedIn: 0, feedback: 0, ended: false });
    expect(perDot).toBe(1);
    expect(total).toBe(44);
    expect(steps.map((step) => step.value)).toEqual([44, 34, null, null]);
    expect(steps[1]).toMatchObject({ percent: 77, of: "responded", dots: 34 });
    expect(steps[2]).toMatchObject({ percent: null, dots: 0 });
  });

  it("uses real zeros once the event has ended", () => {
    const { steps } = funnelSteps({ responded: 10, going: 8, checkedIn: 6, feedback: 0, ended: true });
    expect(steps.map((step) => step.value)).toEqual([10, 8, 6, 0]);
    expect(steps[2]).toMatchObject({ percent: 75, of: "going" });
    expect(steps[3]).toMatchObject({ percent: 0, of: "checked in" });
  });

  it("shows check-ins already recorded during a live event", () => {
    const { steps } = funnelSteps({ responded: 10, going: 8, checkedIn: 3, feedback: 0, ended: false });
    expect(steps[2]?.value).toBe(3);
    expect(steps[3]?.value).toBeNull();
  });
});

describe("waffleCells", () => {
  it("draws one dot per person when everyone fits", () => {
    const cells = waffleCells([{ key: "a", value: 3 }, { key: "b", value: 2 }, { key: "c", value: 0 }]);
    expect(cells).toEqual(["a", "a", "a", "b", "b"]);
  });

  it("scales to the cell count and keeps small groups visible", () => {
    const cells = waffleCells([{ key: "a", value: 990 }, { key: "b", value: 9 }, { key: "c", value: 1 }], 100);
    expect(cells).toHaveLength(100);
    expect(cells.filter((key) => key === "c")).toHaveLength(1);
    expect(cells.filter((key) => key === "b").length).toBeGreaterThanOrEqual(1);
  });

  it("is empty when nobody responded", () => {
    expect(waffleCells([{ key: "a", value: 0 }])).toEqual([]);
  });
});

describe("signupTimeline", () => {
  const until = new Date("2026-10-14T12:00:00Z");

  it("is null without sign-ups", () => {
    expect(signupTimeline([], until)).toBeNull();
  });

  it("uses daily columns for a short span and puts the newest in the last column", () => {
    const timeline = signupTimeline([new Date(until.getTime() - 2 * DAY - 1000), until], until)!;
    expect(timeline.intervalDays).toBe(1);
    expect(timeline.counts).toHaveLength(3);
    expect(timeline.counts[timeline.counts.length - 1]).toBe(1);
    expect(timeline.total).toBe(2);
    expect(timeline.counts.reduce((sum, count) => sum + count, 0)).toBe(2);
  });

  it("groups days to stay within the column limit", () => {
    const dates = Array.from({ length: 60 }, (_, index) => new Date(until.getTime() - index * DAY));
    const timeline = signupTimeline(dates, until, 14)!;
    expect(timeline.counts.length).toBeLessThanOrEqual(14);
    expect(timeline.intervalDays).toBe(5);
    expect(timeline.counts.reduce((sum, count) => sum + count, 0)).toBe(60);
  });

  it("ignores sign-ups after the cut-off", () => {
    const timeline = signupTimeline([until, new Date(until.getTime() + DAY)], until)!;
    expect(timeline.total).toBe(1);
  });
});

describe("busiestDay", () => {
  it("groups by calendar day in the event's timezone", () => {
    // 20:00 UTC on 13 Oct is 01:30 on 14 Oct in Kolkata.
    const dates = [new Date("2026-10-13T20:00:00Z"), new Date("2026-10-14T05:00:00Z"), new Date("2026-10-13T08:00:00Z")];
    expect(busiestDay(dates, "Asia/Kolkata")).toEqual({ day: "14 Oct 2026", count: 2 });
    expect(busiestDay(dates, "UTC")).toEqual({ day: "13 Oct 2026", count: 2 });
  });

  it("is null without dates", () => {
    expect(busiestDay([], "UTC")).toBeNull();
  });
});
