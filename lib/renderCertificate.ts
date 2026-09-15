import "server-only";
import sharp from "sharp";
import { certificateFonts, certificateTemplateSchema, type CertificateTemplate } from "./certificateTemplate";
import { downloadFile } from "./storage";

const escapeMarkup = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export async function renderCustomCertificate(template: CertificateTemplate, name: string, organisationId: string) {
  const config = certificateTemplateSchema.parse(template);
  if (!config.backgroundKey.startsWith(`organisations/${organisationId}/certificate-backgrounds/`)) throw new Error("Invalid certificate background.");
  const image = await downloadFile(config.backgroundKey);
  if (!image) throw new Error("Certificate background unavailable.");
  const source = await sharp(image.body).metadata();
  if (!source.width || !source.height) throw new Error("Invalid certificate dimensions.");
  // Give names a print-sized canvas even when older backgrounds were resized.
  // Upsampling cannot recover missing detail in an already compressed background.
  const scale = Math.max(1, 3508 / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const areaWidth = Math.max(1, Math.floor(width * config.width / 100));
  const areaHeight = Math.max(1, Math.floor(height * config.height / 100));
  const text = name.replace(/[\r\n\t]/g, " ").trim().slice(0, 200) || "Participant";
  // Measure first, then rasterize at the final font size: never shrink a bitmap
  // of the name, which blurs thin strokes and small glyphs.
  const renderText = (size: number) => sharp({ text: {
    text: `<span foreground="${config.color}">${escapeMarkup(text)}</span>`,
    font: `${certificateFonts[config.font].family}${config.bold ? " Bold" : ""} ${size}`,
    dpi: 72, rgba: true,
  } }).png().toBuffer({ resolveWithObject: true });
  let size = Math.max(1, config.fontSize * width / 1000);
  let fitted = await renderText(size);
  for (let attempt = 0; attempt < 6 && (fitted.info.width > areaWidth || fitted.info.height > areaHeight); attempt++) {
    size *= Math.min(areaWidth / fitted.info.width, areaHeight / fitted.info.height) * 0.97;
    fitted = await renderText(Math.max(1, size));
  }
  if (fitted.info.width > areaWidth || fitted.info.height > areaHeight) throw new Error("Name area is too small.");
  const offset = config.align === "center" ? (areaWidth - fitted.info.width) / 2 : config.align === "right" ? areaWidth - fitted.info.width : 0;
  return sharp(image.body).resize(width, height).flatten({ background: "#fff" }).composite([{
    input: fitted.data,
    left: Math.floor(width * config.x / 100 + offset),
    top: Math.floor(height * config.y / 100 + (areaHeight - fitted.info.height) / 2),
  }]).withMetadata({ density: 300 }).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
}
