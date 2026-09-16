import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { certificateTemplateSchema, defaultNameArea } from "@/lib/certificateTemplate";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/lib/storage", () => ({ downloadFile: mocks.download }));
import { renderCustomCertificate } from "@/lib/renderCertificate";

const template = { ...defaultNameArea, backgroundKey: "organisations/org_1/certificate-backgrounds/12345678-1234-4123-8123-123456789abc.webp" };
describe("certificate templates", () => {
  it("rejects remote images, unsupported fonts, injected colors, and out-of-bounds areas", () => {
    for (const change of [{ backgroundKey: "https://example.com/a.png" }, { font: "Comic Sans" }, { color: 'red" onload="alert(1)' }, { x: 95 }, { height: 90 }, { width: 0 }, { fontSize: Infinity }]) {
      expect(certificateTemplateSchema.safeParse({ ...template, ...change }).success).toBe(false);
    }
  });
  it("rejects a background from another tenant before fetching it", async () => {
    mocks.download.mockClear();
    await expect(renderCustomCertificate(template, "Alex", "org_2")).rejects.toThrow("Invalid certificate background");
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it.each(["serif", "sans", "mono"] as const)("renders %s and fits long names inside the area", async (font) => {
    const background = await sharp({ create: { width: 1000, height: 700, channels: 3, background: "#fff" } }).webp().toBuffer();
    mocks.download.mockResolvedValue({ body: background });
    const jpeg = await renderCustomCertificate({ ...template, font, width: 40, height: 5 }, "A very long participant name <&> ".repeat(2), "org_1");
    const metadata = await sharp(jpeg).metadata();
    expect(metadata).toMatchObject({ width: 3508, height: 2456, format: "jpeg", density: 300 });
    const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] < 150) {
        dark++;
        expect(x).toBeGreaterThanOrEqual(Math.floor(info.width * 0.15));
        expect(x).toBeLessThanOrEqual(Math.ceil(info.width * 0.55));
        expect(y).toBeGreaterThanOrEqual(Math.floor(info.height * 0.43));
        expect(y).toBeLessThanOrEqual(Math.ceil(info.height * 0.48));
      }
    }
    expect(dark).toBeGreaterThan(0);
  });
});
