import { describe, expect, it } from "vitest";
import {
  A6_LANDSCAPE,
  A6_PORTRAIT,
  normalizeIdCardPrintSettings,
} from "@/lib/idCardPrint";

describe("ID card print settings", () => {
  it("defaults to A6 portrait and the event title", () => {
    expect(normalizeIdCardPrintSettings(null, "Open House")).toMatchObject({
      ...A6_PORTRAIT,
      heading: "Open House",
      badgeLabel: "ATTENDEE",
      showEmail: true,
      template: "classic",
      footerText: "Event check-in",
      showLogo: true,
      printFieldKeys: [],
      printFieldLabels: {},
      elementPositions: {
        header: { xMm: 9, yMm: 9 },
        qr: { xMm: 73, yMm: 116 },
      },
      gridSizeMm: 5,
      showGrid: true,
    });
  });

  it("keeps valid customisation while bounding paper dimensions", () => {
    expect(normalizeIdCardPrintSettings({
      ...A6_LANDSCAPE,
      heading: "  Welcome  ",
      badgeLabel: "Speaker",
      showEmail: false,
      template: "bold",
      footerText: "Door team",
      showLogo: false,
      printFieldKeys: ["registration:role", "registration:food"],
      printFieldLabels: { "registration:role": "Event role" },
      elementPositions: {
        name: { xMm: 15, yMm: 20 },
        qr: { xMm: 999, yMm: -1 },
      },
      elementSizes: { name: 70, qr: 30 },
      elementBold: { name: false },
      elementTextSizes: { header: 55, name: 4, email: 11 },
      gridSizeMm: 2,
      showGrid: false,
    }, "Open House")).toMatchObject({
      ...A6_LANDSCAPE,
      heading: "Welcome",
      badgeLabel: "Speaker",
      showEmail: false,
      template: "bold",
      footerText: "Door team",
      showLogo: false,
      printFieldKeys: ["registration:role", "registration:food"],
      printFieldLabels: { "registration:role": "Event role" },
      elementPositions: {
        name: { xMm: 15, yMm: 20 },
        qr: { xMm: 114, yMm: 0 },
      },
      elementSizes: { name: 70, qr: 30 },
      elementBold: { name: false },
      elementTextSizes: { header: 48, name: 6, email: 11 },
      gridSizeMm: 2,
      showGrid: false,
    });
    expect(normalizeIdCardPrintSettings({ widthMm: 2, heightMm: 1000 }, "Open House")).toMatchObject({
      widthMm: 40,
      heightMm: 300,
    });
    expect(normalizeIdCardPrintSettings({ printFieldKeys: ["system:organisation-name"] }, "Open House")).toMatchObject({
      printFieldKeys: [],
    });
    expect(normalizeIdCardPrintSettings({ printFieldLabels: { "registration:role": "   " } }, "Open House")).toMatchObject({
      printFieldLabels: { "registration:role": "" },
    });
  });
});

describe("ID card layout on real badge stock", () => {
  it("shrinks long names to fit one line, but never below 60%", async () => {
    const { fitTextSizePt } = await import("@/lib/idCardPrint");
    expect(fitTextSizePt("Priya Raman", 87, 16, true)).toBe(16);
    const long = fitTextSizePt("Alexandra Montgomery-Fitzgerald", 87, 16, true);
    expect(long).toBeLessThan(16);
    expect(long).toBeGreaterThanOrEqual(9.6);
    expect(fitTextSizePt("x".repeat(200), 87, 16, true)).toBe(9.6);
  });

  it("keeps every item on a CR80 card, with the QR still scannable", async () => {
    const { layoutForPaper } = await import("@/lib/idCardPrint");
    for (const template of ["classic", "bold", "minimal"] as const) {
      const layout = layoutForPaper(template, 85.6, 53.98);
      for (const [element, at] of Object.entries(layout.elementPositions)) {
        expect(at.xMm, `${template} ${element} x`).toBeLessThan(85.6);
        expect(at.yMm, `${template} ${element} y`).toBeLessThan(53.98);
      }
      expect(layout.elementSizes.qr).toBeGreaterThanOrEqual(16);
      expect(layout.elementPositions.qr.yMm + layout.elementSizes.qr).toBeLessThanOrEqual(53.98);
      expect(layout.elementTextSizes.name).toBeLessThan(16);
    }
  });

  it("recognises presets either way round", async () => {
    const { matchPaperPreset } = await import("@/lib/idCardPrint");
    expect(matchPaperPreset(85.6, 53.98)?.preset.id).toBe("cr80");
    expect(matchPaperPreset(148, 105)).toMatchObject({ preset: { id: "a6" }, rotated: true });
    expect(matchPaperPreset(90, 60)).toBeNull();
  });

  it("exports and imports designs, rejecting anything else", async () => {
    const { exportIdCardDesign, importIdCardDesign } = await import("@/lib/idCardPrint");
    const design = normalizeIdCardPrintSettings({ template: "bold", heading: "Summit", nameAutoFit: false }, "Open House");
    expect(importIdCardDesign(exportIdCardDesign(design), "Open House")).toEqual(design);
    expect(importIdCardDesign('{"settings":{}}', "Open House")).toBeNull();
    expect(importIdCardDesign("not json", "Open House")).toBeNull();
    // Old saved designs without the new options get the defaults.
    expect(normalizeIdCardPrintSettings({ template: "classic" }, "Open House")).toMatchObject({ nameAutoFit: true, showBadgeLabel: true, showFooter: true });
  });
});
