import { z } from "zod";

export const certificateFonts = {
  serif: { label: "Classic serif", family: "DejaVu Serif", css: '"DejaVu Serif", Georgia, serif' },
  sans: { label: "Clean sans", family: "DejaVu Sans", css: '"DejaVu Sans", Arial, sans-serif' },
  mono: { label: "Monospace", family: "DejaVu Sans Mono", css: '"DejaVu Sans Mono", monospace' },
} as const;

export const certificateTemplateSchema = z.object({
  backgroundKey: z.string().max(300).regex(/^organisations\/[A-Za-z0-9_-]{1,128}\/certificate-backgrounds\/[0-9a-f-]{36}\.webp$/),
  x: z.number().min(0).max(99),
  y: z.number().min(0).max(99),
  width: z.number().min(5).max(100),
  height: z.number().min(3).max(100),
  font: z.enum(["serif", "sans", "mono"]),
  fontSize: z.number().int().min(12).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bold: z.boolean(),
  align: z.enum(["left", "center", "right"]),
}).strict().refine((v) => v.x + v.width <= 100 && v.y + v.height <= 100, "Keep the name area inside the image.");

export type CertificateTemplate = z.infer<typeof certificateTemplateSchema>;
export const defaultNameArea = { x: 15, y: 43, width: 70, height: 14, font: "serif", fontSize: 48, color: "#16243a", bold: false, align: "center" } as const;

export function parseCertificateTemplate(value: unknown): CertificateTemplate | null {
  const parsed = certificateTemplateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
