import { describe, expect, it } from "vitest";
import { conflictingTrackSessionIds, effectiveEventProgram } from "@/lib/eventProgram";

describe("effectiveEventProgram", () => {
  const session = (id: string, start: string, end: string, sortOrder: number, delayMinutes: number) => ({ id, startDateTime: new Date(start), endDateTime: new Date(end), sortOrder, delayMinutes });

  it("keeps planned times when there are no live delays", () => {
    const [first] = effectiveEventProgram([session("one", "2030-01-01T10:00:00Z", "2030-01-01T11:00:00Z", 1, 0)]);
    expect(first.cumulativeDelayMinutes).toBe(0);
    expect(first.effectiveStartDateTime).toEqual(first.startDateTime);
    expect(first.effectiveEndDateTime).toEqual(first.endDateTime);
  });

  it("treats missing or invalid legacy delay values as no delay", () => {
    const legacy = { ...session("one", "2030-01-01T10:00:00Z", "2030-01-01T11:00:00Z", 1, 0), delayMinutes: Number.NaN };
    const [first] = effectiveEventProgram([legacy]);
    expect(first.cumulativeDelayMinutes).toBe(0);
    expect(first.effectiveStartDateTime.toISOString()).toBe("2030-01-01T10:00:00.000Z");
  });

  it("cascades a delay only to sessions following the selected session", () => {
    const result = effectiveEventProgram([
      session("one", "2030-01-01T10:00:00Z", "2030-01-01T11:00:00Z", 1, 15),
      session("two", "2030-01-01T11:00:00Z", "2030-01-01T12:00:00Z", 2, 0),
    ]);
    expect(result.map((item) => item.effectiveStartDateTime.toISOString())).toEqual(["2030-01-01T10:00:00.000Z", "2030-01-01T11:15:00.000Z"]);
  });

  it("accumulates multiple delays in stable chronological order", () => {
    const result = effectiveEventProgram([
      session("later", "2030-01-01T11:00:00Z", "2030-01-01T12:00:00Z", 2, 10),
      session("first", "2030-01-01T10:00:00Z", "2030-01-01T11:00:00Z", 1, 5),
      session("same-time", "2030-01-01T11:00:00Z", "2030-01-01T12:00:00Z", 3, 0),
    ]);
    expect(result.map((item) => item.id)).toEqual(["first", "later", "same-time"]);
    expect(result.map((item) => item.cumulativeDelayMinutes)).toEqual([0, 5, 15]);
  });

  it("cascades delays only within the affected track", () => {
    const result = effectiveEventProgram([
      { ...session("main-one", "2030-01-01T10:00:00Z", "2030-01-01T11:00:00Z", 1, 20), trackId: "main" },
      { ...session("workshop-one", "2030-01-01T10:00:00Z", "2030-01-01T11:00:00Z", 1, 0), trackId: "workshop" },
      { ...session("main-two", "2030-01-01T11:00:00Z", "2030-01-01T12:00:00Z", 2, 0), trackId: "main" },
      { ...session("workshop-two", "2030-01-01T11:00:00Z", "2030-01-01T12:00:00Z", 2, 0), trackId: "workshop" },
    ]);
    expect(result.find((item) => item.id === "main-two")?.effectiveStartDateTime.toISOString()).toBe("2030-01-01T11:20:00.000Z");
    expect(result.find((item) => item.id === "workshop-two")?.effectiveStartDateTime.toISOString()).toBe("2030-01-01T11:00:00.000Z");
  });

  it("flags overlaps inside a track but permits parallel sessions across tracks", () => {
    const conflicts = conflictingTrackSessionIds([
      { ...session("main-one", "2030-01-01T10:00:00Z", "2030-01-01T11:00:00Z", 1, 0), trackId: "main" },
      { ...session("main-two", "2030-01-01T10:30:00Z", "2030-01-01T11:30:00Z", 2, 0), trackId: "main" },
      { ...session("workshop", "2030-01-01T10:30:00Z", "2030-01-01T11:30:00Z", 1, 0), trackId: "workshop" },
    ]);
    expect([...conflicts].sort()).toEqual(["main-one", "main-two"]);
  });
});
