export const ID_CARD_LAYOUT_ELEMENTS = ["header", "name", "email", "details", "qr", "footer", "logo"] as const;

export type IdCardLayoutElement = (typeof ID_CARD_LAYOUT_ELEMENTS)[number];
export type IdCardElementPosition = { xMm: number; yMm: number };
export type IdCardElementPositions = Record<IdCardLayoutElement, IdCardElementPosition>;
export type IdCardElementSizes = Record<IdCardLayoutElement, number>;
export type IdCardElementBold = Record<IdCardLayoutElement, boolean>;
export type IdCardElementTextSizes = Record<IdCardLayoutElement, number>;
export const ID_CARD_GRID_SIZES_MM = [1, 2, 5, 10] as const;
export type IdCardGridSizeMm = (typeof ID_CARD_GRID_SIZES_MM)[number];

export type IdCardPrintSettings = {
  widthMm: number;
  heightMm: number;
  heading: string;
  badgeLabel: string;
  showEmail: boolean;
  template: "classic" | "bold" | "minimal";
  footerText: string;
  showLogo: boolean;
  /** Fields chosen by the organiser for the lower portion of each card. */
  printFieldKeys: string[];
  /** Optional per-card labels; keys correspond to `printFieldKeys`. */
  printFieldLabels: Record<string, string>;
  /** Upper-left positions used by the interactive, millimetre-based card layout. */
  elementPositions: IdCardElementPositions;
  /** Width in millimetres for text elements and square size for QR/logo elements. */
  elementSizes: IdCardElementSizes;
  /** Whether each text element should use a heavier weight. */
  elementBold: IdCardElementBold;
  /** Point size for each text element; QR and logo entries are unused. */
  elementTextSizes: IdCardElementTextSizes;
  /** Design-surface preferences saved with this event's local card settings. */
  gridSizeMm: IdCardGridSizeMm;
  showGrid: boolean;
  /** Shrink long attendee names (down to 60%) so they stay on one line. */
  nameAutoFit: boolean;
  showBadgeLabel: boolean;
  showFooter: boolean;
};

export const A6_PORTRAIT = { widthMm: 105, heightMm: 148 };
export const A6_LANDSCAPE = { widthMm: 148, heightMm: 105 };

/** Common badge stocks. Portrait sizes; the designer offers the landscape turn. */
export const ID_CARD_PAPER_PRESETS = [
  { id: "a6", label: "A6", detail: "105 × 148 mm · sheet paper", widthMm: 105, heightMm: 148 },
  { id: "4x6", label: "4 × 6 in", detail: "Label printer badge", widthMm: 101.6, heightMm: 152.4 },
  { id: "3x4", label: "3 × 4 in", detail: "Lanyard pouch badge", widthMm: 76.2, heightMm: 101.6 },
  { id: "4x3", label: "4 × 3 in", detail: "Landscape pouch badge", widthMm: 101.6, heightMm: 76.2 },
  { id: "cr80", label: "ID card (CR80)", detail: "85.6 × 54 mm · PVC card", widthMm: 85.6, heightMm: 53.98 },
] as const;

export function matchPaperPreset(widthMm: number, heightMm: number) {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.6;
  for (const preset of ID_CARD_PAPER_PRESETS) {
    if (close(preset.widthMm, widthMm) && close(preset.heightMm, heightMm)) return { preset, rotated: false };
    if (close(preset.widthMm, heightMm) && close(preset.heightMm, widthMm)) return { preset, rotated: true };
  }
  return null;
}

/** The small label above the heading scales with it: 8pt on A6, smaller on small cards. */
export function badgeLabelPt(headerPt: number) {
  return Math.min(9, Math.max(5.5, Math.round(headerPt * 0.31 * 2) / 2));
}

/** Layout scale relative to A6 (1 on A6), so small stock gets proportionally smaller text and margins. */
export function paperScale(widthMm: number, heightMm: number) {
  return Math.min(1.6, Math.max(0.45, Math.min(widthMm, heightMm) / 105));
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Point size that keeps `text` on one line within `widthMm`, never above
 * `sizePt` and never below `minRatio` of it (then it wraps instead). Uses an
 * average glyph width, which is close enough for names in sans-serif type.
 */
export function fitTextSizePt(text: string, widthMm: number, sizePt: number, bold: boolean, minRatio = 0.6) {
  const chars = Math.max(1, text.trim().length);
  const emPerChar = bold ? 0.6 : 0.54;
  const fitting = widthMm / (chars * emPerChar * 0.3528);
  return round1(Math.max(sizePt * minRatio, Math.min(sizePt, fitting)));
}

const MIN_DIMENSION_MM = 40;
const MAX_DIMENSION_MM = 300;

function boundedDimension(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(MAX_DIMENSION_MM, Math.max(MIN_DIMENSION_MM, Math.round(numberValue * 10) / 10));
}

function boundedText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function printableFieldKeys(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const keys = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 160 && !item.startsWith("system:"))
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 16);
  return keys;
}

function printableFieldLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, label]) => key.length <= 160 && typeof label === "string")
      .map(([key, label]) => [key, label.trim().slice(0, 60)])
      .slice(0, 16),
  );
}

export function defaultIdCardElementPositions(
  template: IdCardPrintSettings["template"],
  widthMm: number,
  heightMm: number,
): IdCardElementPositions {
  // Tuned on A6 portrait; other stock scales margins with the paper and keeps
  // the name block at the same relative height.
  const k = paperScale(widthMm, heightMm);
  const sizes = defaultIdCardElementSizes(template, widthMm, heightMm);
  const at = (mm: number) => Math.max(3, round1(mm * k));
  const down = (mm: number) => round1(mm * heightMm / 148);
  const qrX = Math.max(4, round1(widthMm - sizes.qr - 10 * k));
  const qrY = Math.max(4, round1(heightMm - sizes.qr - 10 * k));
  const footerY = (mm: number) => Math.max(8, round1(heightMm - mm * k));
  // Never start the name block inside the heading: estimate a one-line heading
  // (label, heading, rule) and push name, email and answers down if needed.
  const text = defaultIdCardElementTextSizes(template, widthMm, heightMm);
  const headerBottom = (top: number) => top + badgeLabelPt(text.header) * 0.3528 * 1.2 + 2.5 * k + text.header * 0.3528 * 1.1 + 2 * k + 3;
  const below = (top: number, ys: [number, number, number]) => {
    const shift = Math.max(0, round1(headerBottom(top) - ys[0]));
    return ys.map((y) => round1(y + shift)) as [number, number, number];
  };
  if (template === "bold") {
    const [nameY, emailY, detailsY] = below(at(9) + 4 * k, [down(45), down(57), down(68)]);
    return {
      header: { xMm: at(16), yMm: at(9) },
      name: { xMm: at(16), yMm: nameY },
      email: { xMm: at(16), yMm: emailY },
      details: { xMm: at(16), yMm: detailsY },
      qr: { xMm: qrX, yMm: at(8) },
      footer: { xMm: at(16), yMm: footerY(9) },
      logo: { xMm: Math.max(4, round1(widthMm - sizes.logo - 11 * k)), yMm: Math.max(4, round1(heightMm - sizes.logo - 15 * k)) },
    };
  }
  if (template === "minimal") {
    const [nameY, emailY, detailsY] = below(at(10) + 4 * k, [down(48), down(60), down(72)]);
    return {
      header: { xMm: at(10), yMm: at(10) },
      name: { xMm: at(10), yMm: nameY },
      email: { xMm: at(10), yMm: emailY },
      details: { xMm: at(10), yMm: detailsY },
      qr: { xMm: qrX, yMm: qrY },
      footer: { xMm: at(10), yMm: footerY(12) },
      logo: { xMm: Math.max(4, round1(widthMm - sizes.logo - 10 * k)), yMm: at(10) },
    };
  }
  const [nameY, emailY, detailsY] = below(at(9), [down(47), down(59), down(73)]);
  return {
    header: { xMm: at(9), yMm: at(9) },
    name: { xMm: at(9), yMm: nameY },
    email: { xMm: at(9), yMm: emailY },
    details: { xMm: at(9), yMm: detailsY },
    qr: { xMm: qrX, yMm: qrY },
    footer: { xMm: at(9), yMm: footerY(12) },
    logo: { xMm: Math.max(4, round1(widthMm - sizes.logo - 11 * k)), yMm: at(9) },
  };
}

export function defaultIdCardElementSizes(
  template: IdCardPrintSettings["template"],
  widthMm: number,
  heightMm: number = A6_PORTRAIT.heightMm,
): IdCardElementSizes {
  const k = paperScale(widthMm, heightMm);
  const qr = Math.min(40, Math.max(16, round1(22 * k)));
  const logo = Math.min(20, Math.max(8, round1(13 * k)));
  // On landscape stock the QR sits beside the text, so text stops short of it.
  const landscape = widthMm > heightMm * 1.15;
  const besideQr = Math.max(20, round1(widthMm - qr - 22 * k));
  const textWidth = (reservedMm: number, nextToQr = false) => {
    const width = Math.max(20, round1(widthMm - reservedMm * k));
    return landscape && nextToQr ? Math.min(width, besideQr) : width;
  };
  if (template === "bold") {
    return {
      header: textWidth(40), name: textWidth(56, true), email: textWidth(56, true), details: textWidth(56, true),
      qr, footer: textWidth(25, true), logo,
    };
  }
  if (template === "minimal") {
    return {
      header: textWidth(43), name: textWidth(19, true), email: textWidth(19, true), details: textWidth(19, true),
      qr, footer: textWidth(49, true), logo,
    };
  }
  return {
    header: textWidth(33), name: textWidth(18, true), email: textWidth(18, true), details: textWidth(49, true),
    qr, footer: textWidth(49, true), logo,
  };
}

export function defaultIdCardElementBold(): IdCardElementBold {
  return { header: true, name: true, email: false, details: false, qr: false, footer: false, logo: false };
}

export function defaultIdCardElementTextSizes(
  template: IdCardPrintSettings["template"] = "classic",
  widthMm: number = A6_PORTRAIT.widthMm,
  heightMm: number = A6_PORTRAIT.heightMm,
): IdCardElementTextSizes {
  const base = template === "bold"
    ? { header: 28, name: 17, email: 10, details: 8.5, footer: 8 }
    : template === "minimal"
      ? { header: 24, name: 15, email: 10, details: 8.5, footer: 8 }
      : { header: 26, name: 16, email: 10, details: 8.5, footer: 8 };
  const k = paperScale(widthMm, heightMm);
  const scaled = (pt: number, min: number) => Math.max(min, Math.round(pt * k * 2) / 2);
  // Headings shrink a little faster than body text so small cards keep room for the name.
  const headerScale = k < 1 ? k ** 1.4 : k;
  return {
    header: Math.max(10, Math.round(base.header * headerScale * 2) / 2), name: scaled(base.name, 9), email: scaled(base.email, 6),
    details: scaled(base.details, 6), qr: 0, footer: scaled(base.footer, 6), logo: 0,
  };
}

function boundedPosition(value: unknown, fallback: IdCardElementPosition, widthMm: number, heightMm: number) {
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<IdCardElementPosition>;
  const x = typeof input.xMm === "number" ? input.xMm : Number(input.xMm);
  const y = typeof input.yMm === "number" ? input.yMm : Number(input.yMm);
  return {
    xMm: Number.isFinite(x) ? Math.min(widthMm - 4, Math.max(0, Math.round(x * 10) / 10)) : fallback.xMm,
    yMm: Number.isFinite(y) ? Math.min(heightMm - 4, Math.max(0, Math.round(y * 10) / 10)) : fallback.yMm,
  };
}

function elementPositions(
  value: unknown,
  template: IdCardPrintSettings["template"],
  widthMm: number,
  heightMm: number,
) {
  const fallback = defaultIdCardElementPositions(template, widthMm, heightMm);
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<IdCardLayoutElement, unknown>>
    : {};
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => [
    element,
    boundedPosition(input[element], fallback[element], widthMm, heightMm),
  ])) as IdCardElementPositions;
}

function elementSizes(value: unknown, template: IdCardPrintSettings["template"], widthMm: number, heightMm: number) {
  const fallback = defaultIdCardElementSizes(template, widthMm, heightMm);
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<IdCardLayoutElement, unknown>>
    : {};
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => {
    const size = typeof input[element] === "number" ? input[element] : Number(input[element]);
    const minimum = element === "qr" || element === "logo" ? 10 : 20;
    const maximum = Math.max(minimum, widthMm - 4);
    return [element, Number.isFinite(size) ? Math.min(maximum, Math.max(minimum, Math.round(size * 10) / 10)) : fallback[element]];
  })) as IdCardElementSizes;
}

function fitElementPositions(
  positions: IdCardElementPositions,
  sizes: IdCardElementSizes,
  widthMm: number,
  heightMm: number,
) {
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => {
    const squareElement = element === "qr" || element === "logo";
    return [element, {
      xMm: Math.min(Math.max(0, widthMm - sizes[element] - 4), positions[element].xMm),
      yMm: squareElement ? Math.min(Math.max(0, heightMm - sizes[element] - 4), positions[element].yMm) : positions[element].yMm,
    }];
  })) as IdCardElementPositions;
}

function elementBold(value: unknown) {
  const fallback = defaultIdCardElementBold();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const input = value as Partial<Record<IdCardLayoutElement, unknown>>;
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => [
    element,
    typeof input[element] === "boolean" ? input[element] : fallback[element],
  ])) as IdCardElementBold;
}

function elementTextSizes(value: unknown, template: IdCardPrintSettings["template"], widthMm: number, heightMm: number) {
  const fallback = defaultIdCardElementTextSizes(template, widthMm, heightMm);
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<IdCardLayoutElement, unknown>>
    : {};
  return Object.fromEntries(ID_CARD_LAYOUT_ELEMENTS.map((element) => {
    if (element === "qr" || element === "logo") return [element, 0];
    const size = typeof input[element] === "number" ? input[element] : Number(input[element]);
    return [element, Number.isFinite(size) ? Math.min(48, Math.max(6, Math.round(size * 10) / 10)) : fallback[element]];
  })) as IdCardElementTextSizes;
}

function gridSizeMm(value: unknown): IdCardGridSizeMm {
  const numberValue = typeof value === "number" ? value : Number(value);
  return ID_CARD_GRID_SIZES_MM.find((size) => size === numberValue) ?? 5;
}

export function defaultIdCardPrintSettings(eventTitle: string, organisationName = ""): IdCardPrintSettings {
  return {
    ...A6_PORTRAIT,
    heading: eventTitle.trim().slice(0, 120) || "Event attendee",
    badgeLabel: "ATTENDEE",
    showEmail: true,
    template: "classic",
    footerText: organisationName.trim().slice(0, 80) || "Event check-in",
    showLogo: true,
    printFieldKeys: [],
    printFieldLabels: {},
    elementPositions: defaultIdCardElementPositions("classic", A6_PORTRAIT.widthMm, A6_PORTRAIT.heightMm),
    elementSizes: defaultIdCardElementSizes("classic", A6_PORTRAIT.widthMm, A6_PORTRAIT.heightMm),
    elementBold: defaultIdCardElementBold(),
    elementTextSizes: defaultIdCardElementTextSizes("classic"),
    gridSizeMm: 5,
    showGrid: true,
    nameAutoFit: true,
    showBadgeLabel: true,
    showFooter: true,
  };
}

/** Keep locally saved station settings safe and usable before printing. */
export function normalizeIdCardPrintSettings(
  value: unknown,
  eventTitle: string,
  organisationName = "",
): IdCardPrintSettings {
  const fallback = defaultIdCardPrintSettings(eventTitle, organisationName);
  if (!value || typeof value !== "object") return fallback;
  const input = value as Partial<IdCardPrintSettings>;
  const widthMm = boundedDimension(input.widthMm, fallback.widthMm);
  const heightMm = boundedDimension(input.heightMm, fallback.heightMm);
  const template = input.template === "bold" || input.template === "minimal" || input.template === "classic"
    ? input.template
    : fallback.template;
  const sizes = elementSizes(input.elementSizes, template, widthMm, heightMm);
  const positions = elementPositions(input.elementPositions, template, widthMm, heightMm);
  return {
    widthMm,
    heightMm,
    heading: boundedText(input.heading, fallback.heading, 120),
    badgeLabel: boundedText(input.badgeLabel, fallback.badgeLabel, 40),
    showEmail: typeof input.showEmail === "boolean" ? input.showEmail : fallback.showEmail,
    template,
    footerText: boundedText(input.footerText, fallback.footerText, 80),
    showLogo: typeof input.showLogo === "boolean" ? input.showLogo : fallback.showLogo,
    printFieldKeys: printableFieldKeys(input.printFieldKeys, fallback.printFieldKeys),
    printFieldLabels: printableFieldLabels(input.printFieldLabels),
    elementPositions: fitElementPositions(positions, sizes, widthMm, heightMm),
    elementSizes: sizes,
    elementBold: elementBold(input.elementBold),
    elementTextSizes: elementTextSizes(input.elementTextSizes, template, widthMm, heightMm),
    gridSizeMm: gridSizeMm(input.gridSizeMm),
    showGrid: typeof input.showGrid === "boolean" ? input.showGrid : fallback.showGrid,
    nameAutoFit: typeof input.nameAutoFit === "boolean" ? input.nameAutoFit : fallback.nameAutoFit,
    showBadgeLabel: typeof input.showBadgeLabel === "boolean" ? input.showBadgeLabel : fallback.showBadgeLabel,
    showFooter: typeof input.showFooter === "boolean" ? input.showFooter : fallback.showFooter,
  };
}

/** A fresh layout for `template` on the given paper: positions, sizes and text sizes together. */
export function layoutForPaper(template: IdCardPrintSettings["template"], widthMm: number, heightMm: number) {
  return {
    elementPositions: defaultIdCardElementPositions(template, widthMm, heightMm),
    elementSizes: defaultIdCardElementSizes(template, widthMm, heightMm),
    elementTextSizes: defaultIdCardElementTextSizes(template, widthMm, heightMm),
    elementBold: defaultIdCardElementBold(),
  };
}

const DESIGN_FILE_KIND = "yuyu-id-card-design";

/** A portable design file, for copying a badge design to another check-in desk. */
export function exportIdCardDesign(settings: IdCardPrintSettings): string {
  return JSON.stringify({ kind: DESIGN_FILE_KIND, version: 1, settings }, null, 2);
}

/** Read a design file; anything unexpected is normalised or rejected, never trusted. */
export function importIdCardDesign(text: string, eventTitle: string, organisationName = ""): IdCardPrintSettings | null {
  try {
    const parsed = JSON.parse(text) as { kind?: unknown; settings?: unknown };
    if (!parsed || parsed.kind !== DESIGN_FILE_KIND || !parsed.settings || typeof parsed.settings !== "object") return null;
    return normalizeIdCardPrintSettings(parsed.settings, eventTitle, organisationName);
  } catch {
    return null;
  }
}
