import { describe, expect, it } from "vitest";
import { normalizeStationPin } from "@/lib/stationPin";

describe("normalizeStationPin", () => {
  it("keeps the first eight ASCII digits from typed or pasted input", () => {
    expect(normalizeStationPin("PIN: 0123-4567-89")).toBe("01234567");
  });

  it("normalizes commonly used decimal digit scripts to the server format", () => {
    expect(normalizeStationPin("०१२३ ٤٥٦٧")).toBe("01234567");
  });
});
