"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Printer, Redo2, Undo2, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SegmentedControl, Switch } from "@/components/ui/choice";
import { Callout, Chip } from "@/components/ui/display";
import { Description as DialogDescription, Title as DialogTitle } from "@radix-ui/react-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Dropdown } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import QRCode from "react-qr-code";
import {
  A6_LANDSCAPE,
  A6_PORTRAIT,
  defaultIdCardElementBold,
  defaultIdCardElementPositions,
  defaultIdCardElementSizes,
  defaultIdCardElementTextSizes,
  defaultIdCardPrintSettings,
  ID_CARD_GRID_SIZES_MM,
  normalizeIdCardPrintSettings,
  type IdCardLayoutElement,
  type IdCardPrintSettings,
} from "@/lib/idCardPrint";

type Attendee = {
  displayName: string;
  email: string | null;
  /** Active ticket bearer token used only for rendering this attendee's QR. */
  checkInQrToken: string;
  checkInDetails: Array<{ label: string; value: string }>;
  registrationDetails: Array<{ key: string; label: string; value: string }>;
};

type RegistrationField = { key: string; label: string };
type PrintableField = { key: string; label: string; value: string };
type LayoutDrag = {
  element: IdCardLayoutElement;
  pointerX: number;
  pointerY: number;
  position: { xMm: number; yMm: number };
  previewRect: DOMRect;
};

const storageKey = (eventId: string) => `yuyu:checkin:id-card:${eventId}`;
const settingsChangedEvent = "yuyu:id-card-print-settings-changed";
const sessionSettings = new Map<string, IdCardPrintSettings>();
const registrationFieldKey = (key: string) => `registration:${key}`;
// Keep the longest paper edge at a fixed preview length so orientation changes
// do not inadvertently change the apparent scale of the card.
const PREVIEW_LONG_EDGE_PX = 460;
const SAFE_MARGIN_MM = 5;
const TEMPLATE_OPTIONS = [
  { key: "classic", label: "Classic", description: "Framed and balanced" },
  { key: "bold", label: "Bold", description: "Strong side-band identity" },
  { key: "minimal", label: "Minimal", description: "Clean editorial layout" },
] as const;
const LAYOUT_ELEMENT_LABELS: Record<IdCardLayoutElement, string> = {
  header: "Event heading",
  name: "Attendee name",
  email: "Email",
  details: "Registration fields",
  qr: "Check-in QR",
  footer: "Footer",
  logo: "Organisation logo",
};

function subscribeToCompactPreview(onChange: () => void) {
  const query = window.matchMedia("(max-width:599px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useCompactPreview() {
  return useSyncExternalStore(subscribeToCompactPreview, () => window.matchMedia("(max-width:599px)").matches, () => false);
}

function SwitchField({ id, label, checked, disabled, onCheckedChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      <label htmlFor={id} className={cn("text-body-ui text-ink", disabled && "text-ink-muted")}>{label}</label>
    </div>
  );
}

function snapToGrid(value: number, gridSizeMm: number) {
  return Math.round(value / gridSizeMm) * gridSizeMm;
}

function readSettings(eventId: string, eventTitle: string, organisationName: string) {
  const cached = sessionSettings.get(eventId);
  if (cached) return cached;
  const fallback = defaultIdCardPrintSettings(eventTitle, organisationName);
  try {
    const saved = window.localStorage.getItem(storageKey(eventId));
    if (saved) {
      const settings = normalizeIdCardPrintSettings(JSON.parse(saved), eventTitle, organisationName);
      sessionSettings.set(eventId, settings);
      return settings;
    }
  } catch {
    // A private or locked-down station can use the in-memory settings below.
  }
  sessionSettings.set(eventId, fallback);
  return fallback;
}

function escapePrintHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeLogoUrl(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function printableFields(
  settings: IdCardPrintSettings,
  attendee: Attendee,
): PrintableField[] {
  const registrationDetails = new Map(attendee.registrationDetails.map((detail) => [detail.key, detail]));
  return settings.printFieldKeys.flatMap((key) => {
    const detail = registrationDetails.get(key.startsWith("registration:") ? key.slice("registration:".length) : key);
    return detail ? [{ key, label: detail.label, value: detail.value }] : [];
  });
}

function printableDetails(fields: PrintableField[], settings: IdCardPrintSettings, style = "", bold = false) {
  if (fields.length === 0) return "";
  return `<dl class="details ${bold ? "is-bold" : "is-regular"}"${style ? ` style="${style}"` : ""}>${fields.map((detail) => {
    const label = settings.printFieldLabels[detail.key] ?? detail.label;
    return `<div${label ? "" : ' class="label-free"'}>${label ? `<dt>${escapePrintHtml(label)}</dt>` : ""}<dd>${escapePrintHtml(detail.value)}</dd></div>`;
  }).join("")}</dl>`;
}

function printPosition(settings: IdCardPrintSettings, element: IdCardLayoutElement) {
  const position = settings.elementPositions[element];
  return `left:${position.xMm}mm;top:${position.yMm}mm;`;
}

function printTextStyle(settings: IdCardPrintSettings, element: Exclude<IdCardLayoutElement, "qr" | "logo">) {
  const fontSize = element === "header" ? "" : `font-size:${settings.elementTextSizes[element]}pt;`;
  return `${printPosition(settings, element)}width:${settings.elementSizes[element]}mm;font-weight:${settings.elementBold[element] ? 700 : 400};${fontSize}`;
}

async function printCard(params: { settings: IdCardPrintSettings; attendee: Attendee; organisationLogoUrl: string | null }) {
  const { settings, attendee, organisationLogoUrl } = params;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.opener = null;

  let qrDataUrl: string;
  try {
    const QRCode = await import("qrcode");
    qrDataUrl = await QRCode.toDataURL(attendee.checkInQrToken, {
      width: 360,
      margin: 0,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
  } catch {
    printWindow.close();
    return false;
  }

  const heading = escapePrintHtml(settings.heading);
  const badgeLabel = escapePrintHtml(settings.badgeLabel);
  const name = escapePrintHtml(attendee.displayName);
  const email = attendee.email ? escapePrintHtml(attendee.email) : "";
  const emailLine = settings.showEmail && email ? `<p class="email" style="${printTextStyle(settings, "email")}">${email}</p>` : "";
  const logoUrl = settings.showLogo ? safeLogoUrl(organisationLogoUrl) : null;
  const logo = logoUrl ? `<img id="badge-logo" class="logo" style="${printPosition(settings, "logo")}width:${settings.elementSizes.logo}mm;height:${settings.elementSizes.logo}mm;" src="${escapePrintHtml(logoUrl)}" alt="">` : "";
  const details = printableDetails(printableFields(settings, attendee), settings, printTextStyle(settings, "details"), settings.elementBold.details);

  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${name} ID card</title><style>
  @page { size: ${settings.widthMm}mm ${settings.heightMm}mm; margin: 0; }
  :root { --accent: #000; }
  * { box-sizing: border-box; -webkit-print-color-adjust: economy; print-color-adjust: economy; }
  html, body { width: ${settings.widthMm}mm; height: ${settings.heightMm}mm; margin: 0; }
  body { color: #0F172A; font-family: Inter, Arial, Helvetica, sans-serif; }
  .card { width: 100%; height: 100%; position: relative; background: #fff; border: 0.6mm solid #0F172A; overflow: hidden; }
  .top { position: absolute; width: 58%; margin: 0; }
  .logo { position: absolute; width: 13mm; height: 13mm; border-radius: 3mm; object-fit: contain; background: #fff; padding: 1mm; }
  .label { margin: 0; color: var(--accent); font-size: 8pt; font-weight: 800; letter-spacing: 0.16em; }
  .heading { margin: 2.5mm 0 0; font-size: 26pt; font-weight: 700; line-height: 1.08; letter-spacing: -0.025em; overflow-wrap: anywhere; }
  .name { position: absolute; margin: 0; font-size: 16pt; font-weight: 800; line-height: 1.12; letter-spacing: -0.015em; overflow-wrap: anywhere; }
  .email { position: absolute; margin: 0; color: #475569; font-size: 10pt; overflow-wrap: anywhere; }
  .details { position: absolute; margin: 0; padding: 3mm 0 0; border-top: 0.3mm solid #CBD5E1; }
  .details div { display: flex; justify-content: space-between; gap: 4mm; margin-top: 1.5mm; }
  .details .label-free { justify-content: flex-start; } .details.is-regular dd { font-weight: 400; }
  .details dt { color: #64748B; } .details dd { margin: 0; font-weight: 700; text-align: right; }
  .qr-block { position: absolute; z-index: 2; background: #fff; padding: 1mm; }
  .qr { width: ${settings.elementSizes.qr}mm; height: ${settings.elementSizes.qr}mm; display: block; image-rendering: pixelated; }
  .footer { position: absolute; margin: 0; color: #64748B; font-size: 8pt; }
  /* Classic is a traditional framed event badge. */
  .classic .top { padding-bottom: 2mm; border-bottom: 0.3mm solid #000; }
  /* Bold uses a distinct side-band and uppercase name treatment. */
  .card.bold { border: 1.2mm solid #000; }
  .bold::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 6mm; background: #000; }
  .bold .top { padding-top: 4mm; border-top: 0.6mm solid #000; }
  .bold .heading { font-size: 28pt; } .bold .name { font-size: 17pt; text-transform: uppercase; letter-spacing: -0.02em; }
  .bold .details { border-top-width: 0.6mm; } .bold .footer { font-weight: 700; }
  /* Minimal removes the enclosing frame and uses whitespace and a hairline divider. */
  .card.minimal { border: 0; }
  .minimal .top { display: block; padding: 4mm 0 0; border-top: 0.3mm solid #000; }
  .minimal .heading { margin-top: 1mm; font-size: 24pt; line-height: 1.1; }
  .minimal .name { font-size: 15pt; font-weight: 700; letter-spacing: -0.015em; }
  .minimal .details { border-top: 0; padding-top: 0; }
  /* One high-contrast output works well on both monochrome laser and thermal printers. */
  .card { color: #000; border-color: #000; } .label, .heading, .footer, .email, .details dt { color: #000; }
  .rule { background: #000; } .details { border-color: #000; } .logo { filter: grayscale(1) contrast(1.8); }
</style></head><body><main class="card ${settings.template}"><div class="top" style="${printTextStyle(settings, "header")}"><p class="label" style="font-weight:${settings.elementBold.header ? 800 : 400}">${badgeLabel}</p><h1 class="heading" style="font-size:${settings.elementTextSizes.header}pt;font-weight:${settings.elementBold.header ? 700 : 400}">${heading}</h1></div>${logo}<p class="name" style="${printTextStyle(settings, "name")}">${name}</p>${emailLine}${details}<div class="qr-block" style="${printPosition(settings, "qr")}"><img id="badge-qr" class="qr" src="${escapePrintHtml(qrDataUrl)}" alt="Check-in QR code"></div><p class="footer" style="${printTextStyle(settings, "footer")}">${escapePrintHtml(settings.footerText)}</p></main></body></html>`);
  printWindow.document.close();
  printWindow.focus();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.print();
  };
  const images = ["badge-logo", "badge-qr"]
    .map((id) => printWindow.document.getElementById(id) as HTMLImageElement | null)
    .filter((image): image is HTMLImageElement => Boolean(image));
  if (images.length === 0) window.setTimeout(triggerPrint, 100);
  else {
    let remaining = images.filter((image) => !image.complete).length;
    if (remaining === 0) window.setTimeout(triggerPrint, 100);
    else images.forEach((image) => {
      const finish = () => {
        remaining -= 1;
        if (remaining === 0) triggerPrint();
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    });
    window.setTimeout(triggerPrint, 1500);
  }
  return true;
}

export function IdCardPrintDialog(props: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  organisationName: string;
  organisationLogoUrl: string | null;
  attendee: Attendee | null;
  registrationFields: RegistrationField[];
}) {
  const { open, onClose, eventId, eventTitle, organisationName, organisationLogoUrl, attendee, registrationFields } = props;
  const [layoutDrag, setLayoutDrag] = useState<LayoutDrag | null>(null);
  const [selectedLayoutElement, setSelectedLayoutElement] = useState<IdCardLayoutElement>("name");
  const compactPreview = useCompactPreview();
  const [activeTab, setActiveTab] = useState(0);
  const [cleanPreview, setCleanPreview] = useState(false);
  const [undoHistory, setUndoHistory] = useState<IdCardPrintSettings[]>([]);
  const [redoHistory, setRedoHistory] = useState<IdCardPrintSettings[]>([]);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const draggingElement = layoutDrag?.element ?? null;
  const defaultSettings = useMemo(() => defaultIdCardPrintSettings(eventTitle, organisationName), [eventTitle, organisationName]);
  const subscribe = useCallback((onStoreChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(eventId)) {
        sessionSettings.delete(eventId);
        onStoreChange();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(settingsChangedEvent, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(settingsChangedEvent, onStoreChange);
    };
  }, [eventId]);
  const getSnapshot = useCallback(() => readSettings(eventId, eventTitle, organisationName), [eventId, eventTitle, organisationName]);
  const getServerSnapshot = useCallback(() => defaultSettings, [defaultSettings]);
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const sampleAttendee = attendee ?? {
    displayName: "Attendee name",
    email: "attendee@example.com",
    checkInQrToken: "preview-check-in-token",
    checkInDetails: [{ label: "Food preference", value: "Vegetarian" }],
    registrationDetails: registrationFields.map((field) => ({
      key: field.key,
      label: field.label,
      value: `{{${field.label}}}`,
    })),
  };
  const fieldOptions = useMemo(() => (
    registrationFields.map((field) => ({
      key: registrationFieldKey(field.key),
      label: field.label,
      detail: /organi[sz]ation|company/i.test(`${field.key} ${field.label}`)
        ? "Participant organisation field"
        : /role/i.test(`${field.key} ${field.label}`)
          ? "Role field"
          : "Registration field",
    }))
  ), [registrationFields]);
  const selectedFieldOptions = settings.printFieldKeys.flatMap((key) => {
    const field = fieldOptions.find((option) => option.key === key);
    return field ? [field] : [];
  });
  const availableFieldOptions = fieldOptions.filter((field) => !settings.printFieldKeys.includes(field.key));
  const previewFields = printableFields(settings, sampleAttendee);
  const ratio = `${settings.widthMm} / ${settings.heightMm}`;
  const paperDescription = `${settings.widthMm} × ${settings.heightMm} mm`;
  const previewWidthPx = (compactPreview ? 270 : PREVIEW_LONG_EDGE_PX) * settings.widthMm / Math.max(settings.widthMm, settings.heightMm);
  const previewPixelsPerMillimetre = previewWidthPx / settings.widthMm;
  const isA6Portrait = settings.widthMm === A6_PORTRAIT.widthMm && settings.heightMm === A6_PORTRAIT.heightMm;
  const isA6Landscape = settings.widthMm === A6_LANDSCAPE.widthMm && settings.heightMm === A6_LANDSCAPE.heightMm;
  const logoUrl = settings.showLogo ? safeLogoUrl(organisationLogoUrl) : null;
  const selectedElementIsText = selectedLayoutElement !== "qr" && selectedLayoutElement !== "logo";
  const previewTextSize = (element: IdCardLayoutElement) => `${settings.elementTextSizes[element] * 0.3528 * previewPixelsPerMillimetre}px`;
  const previewPositionStyle = (element: IdCardLayoutElement): CSSProperties => {
    const position = settings.elementPositions[element];
    return {
      position: "absolute",
      left: `${position.xMm * previewPixelsPerMillimetre}px`,
      top: `${position.yMm * previewPixelsPerMillimetre}px`,
      cursor: cleanPreview ? "default" : "grab",
      touchAction: cleanPreview ? "auto" : "none",
      userSelect: "none",
      zIndex: draggingElement === element ? 3 : selectedLayoutElement === element ? 2 : 1,
    };
  };
  const previewOutlineClass = (element: IdCardLayoutElement) => cleanPreview
    ? "outline-none"
    : draggingElement === element || selectedLayoutElement === element
      ? "outline outline-2 outline-offset-2 outline-[#1976d2]"
      : "outline-dashed outline-1 outline-offset-2 outline-transparent hover:outline-[#1976d2]";
  const previewItemWidth = (element: IdCardLayoutElement) => `${settings.elementSizes[element] * previewPixelsPerMillimetre}px`;

  const update = (patch: Partial<IdCardPrintSettings>, recordHistory = true) => {
    if (recordHistory && !layoutDrag) {
      setUndoHistory((history) => [...history.slice(-49), settings]);
      setRedoHistory([]);
    }
    const next = normalizeIdCardPrintSettings({ ...settings, ...patch }, eventTitle, organisationName);
    for (const [key, maxLength] of [["heading", 120], ["badgeLabel", 40], ["footerText", 80]] as const) {
      next[key] = (patch[key] ?? settings[key]).slice(0, maxLength);
    }
    sessionSettings.set(eventId, next);
    try {
      window.localStorage.setItem(storageKey(eventId), JSON.stringify(next));
    } catch {
      // Keep the settings only for this browser session when storage is unavailable.
    }
    window.dispatchEvent(new Event(settingsChangedEvent));
  };

  const updatePaper = (paper: { widthMm: number; heightMm: number }) => update({
    ...paper,
    elementPositions: defaultIdCardElementPositions(settings.template, paper.widthMm, paper.heightMm),
    elementSizes: defaultIdCardElementSizes(settings.template, paper.widthMm),
  });

  const updateElementPosition = (element: IdCardLayoutElement, xMm: number, yMm: number) => {
    const current = settings.elementPositions[element];
    const squareElement = element === "qr" || element === "logo";
    const next = {
      xMm: Math.min(Math.max(0, settings.widthMm - settings.elementSizes[element] - SAFE_MARGIN_MM), Math.max(0, snapToGrid(xMm, settings.gridSizeMm))),
      yMm: Math.min(Math.max(0, settings.heightMm - (squareElement ? settings.elementSizes[element] : 0) - SAFE_MARGIN_MM), Math.max(0, snapToGrid(yMm, settings.gridSizeMm))),
    };
    if (current.xMm === next.xMm && current.yMm === next.yMm) return;
    update({ elementPositions: { ...settings.elementPositions, [element]: next } });
  };

  const updateElementSize = (element: IdCardLayoutElement, sizeMm: number) => {
    update({ elementSizes: { ...settings.elementSizes, [element]: sizeMm } });
  };

  const updateElementTextSize = (element: IdCardLayoutElement, sizePt: number) => {
    update({ elementTextSizes: { ...settings.elementTextSizes, [element]: sizePt } });
  };

  const alignSelectedElement = (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    const element = selectedLayoutElement;
    const position = settings.elementPositions[element];
    const squareElement = element === "qr" || element === "logo";
    const elementSize = settings.elementSizes[element];
    if (alignment === "left") return updateElementPosition(element, SAFE_MARGIN_MM, position.yMm);
    if (alignment === "center") return updateElementPosition(element, (settings.widthMm - elementSize) / 2, position.yMm);
    if (alignment === "right") return updateElementPosition(element, settings.widthMm - elementSize - SAFE_MARGIN_MM, position.yMm);
    if (alignment === "top") return updateElementPosition(element, position.xMm, SAFE_MARGIN_MM);
    if (alignment === "middle") return updateElementPosition(element, position.xMm, (settings.heightMm - (squareElement ? elementSize : 0)) / 2);
    return updateElementPosition(element, position.xMm, settings.heightMm - (squareElement ? elementSize : 0) - SAFE_MARGIN_MM);
  };

  const resetSelectedElementPosition = () => {
    const position = defaultIdCardElementPositions(settings.template, settings.widthMm, settings.heightMm)[selectedLayoutElement];
    update({ elementPositions: { ...settings.elementPositions, [selectedLayoutElement]: position } });
  };

  const startLayoutDrag = (element: IdCardLayoutElement, event: ReactPointerEvent<HTMLElement>) => {
    const preview = event.currentTarget.closest<HTMLElement>("[data-id-card-preview]");
    if (cleanPreview || event.button !== 0 || !preview) return;
    setUndoHistory((history) => [...history.slice(-49), settings]);
    setRedoHistory([]);
    setActiveTab(2);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setLayoutDrag({
      element,
      pointerX: event.clientX,
      pointerY: event.clientY,
      position: settings.elementPositions[element],
      previewRect: preview.getBoundingClientRect(),
    });
    setSelectedLayoutElement(element);
  };

  const moveLayoutDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = layoutDrag;
    if (!drag) return;
    updateElementPosition(
      drag.element,
      drag.position.xMm + ((event.clientX - drag.pointerX) * settings.widthMm / drag.previewRect.width),
      drag.position.yMm + ((event.clientY - drag.pointerY) * settings.heightMm / drag.previewRect.height),
    );
  };

  const endLayoutDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setLayoutDrag(null);
  };

  const layoutItemProps = (element: IdCardLayoutElement) => ({
    role: "button" as const,
    tabIndex: cleanPreview ? -1 : 0,
    "aria-label": `${LAYOUT_ELEMENT_LABELS[element]}. Drag to move; arrow keys move by ${settings.gridSizeMm} millimetres.`,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startLayoutDrag(element, event),
    onPointerMove: moveLayoutDrag,
    onPointerUp: endLayoutDrag,
    onPointerCancel: endLayoutDrag,
    onFocus: () => { if (!cleanPreview) { setSelectedLayoutElement(element); setActiveTab(2); } },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (cleanPreview) return;
      const position = settings.elementPositions[element];
      if (event.key === "ArrowLeft") updateElementPosition(element, position.xMm - settings.gridSizeMm, position.yMm);
      else if (event.key === "ArrowRight") updateElementPosition(element, position.xMm + settings.gridSizeMm, position.yMm);
      else if (event.key === "ArrowUp") updateElementPosition(element, position.xMm, position.yMm - settings.gridSizeMm);
      else if (event.key === "ArrowDown") updateElementPosition(element, position.xMm, position.yMm + settings.gridSizeMm);
      else return;
      event.preventDefault();
    },
  });

  const togglePrintField = (key: string, checked: boolean) => {
    const printFieldKeys = checked
      ? [...settings.printFieldKeys, key]
      : settings.printFieldKeys.filter((fieldKey) => fieldKey !== key);
    update({ printFieldKeys });
  };

  const updatePrintFieldLabel = (key: string, label: string) => {
    const printFieldLabels = { ...settings.printFieldLabels };
    // An explicit empty value is meaningful: print the answer without a label.
    printFieldLabels[key] = label;
    update({ printFieldLabels });
  };

  const previewTemplateStyle: CSSProperties = settings.template === "bold"
    ? { border: "3px solid #000" }
    : settings.template === "minimal"
      ? { border: 0, boxShadow: "0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12)" }
      : {};
  const tabTriggerClass = "flex-1 justify-center";
  const selectedPosition = settings.elementPositions[selectedLayoutElement];
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="xl" hideClose aria-labelledby="id-card-designer-title" className="max-h-[94dvh] w-[calc(100vw-16px)] sm:w-[calc(100vw-48px)] md:h-[min(900px,94dvh)]">
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <DialogTitle id="id-card-designer-title" className="text-h4 text-ink">ID card designer</DialogTitle>
            <DialogDescription className="text-body-ui text-ink-muted">{eventTitle} · {attendee ? "Personalise and print this attendee’s card" : "Create a reusable card for your check-in desk"}</DialogDescription>
          </div>
          <IconButton label="Close designer" onClick={onClose}><X /></IconButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <Tabs value={String(activeTab)} onValueChange={(value) => setActiveTab(Number(value))} className="flex min-h-0 shrink-0 flex-col border-line md:w-[380px] md:border-r">
            <TabsList aria-label="Designer settings" className="shrink-0 px-2">
              {["Design", "Content", "Layout"].map((label, index) => <TabsTrigger key={label} value={String(index)} className={tabTriggerClass}>{label}</TabsTrigger>)}
            </TabsList>
            <div className="max-h-[360px] overflow-y-auto p-5 md:max-h-none md:flex-1">
              <TabsContent value="0" className="flex flex-col gap-5 pt-0">
                <div>
                  <h3 className="text-label text-ink">Start with a style</h3>
                  <p className="text-body-ui text-ink-muted">Choose a template, then make it yours. Switching styles resets the layout.</p>
                </div>
                <div>
                  <p className="mb-2 text-label text-ink">Template</p>
                  <div className="flex flex-col gap-2" aria-label="ID card template" role="group">
                    {TEMPLATE_OPTIONS.map((template) => {
                      const selected = settings.template === template.key;
                      return (
                        <button
                          key={template.key}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => update({
                            template: template.key,
                            elementPositions: defaultIdCardElementPositions(template.key, settings.widthMm, settings.heightMm),
                            elementSizes: defaultIdCardElementSizes(template.key, settings.widthMm),
                            elementBold: defaultIdCardElementBold(),
                            elementTextSizes: defaultIdCardElementTextSizes(template.key),
                          })}
                          className={cn("flex min-h-[76px] items-start gap-4 rounded-lg border bg-canvas p-3 text-left transition-colors hover:bg-subtle", selected ? "border-[1.5px] border-primary bg-subtle" : "border-line")}
                        >
                          <span aria-hidden className="block h-[54px] w-[42px] shrink-0 bg-white p-[5.6px] text-[#172032] shadow-sm" style={{ border: template.key === "minimal" ? "1px solid #ddd" : "2px solid", borderLeftWidth: template.key === "bold" ? 7 : 1 }}>
                            <span className="mb-2 block h-[3px] w-[80%] bg-current" />
                            <span className="mb-1 block h-[5px] w-[65%] bg-current" />
                            <span className="block h-[2px] w-[90%] bg-[#aaa]" />
                            <span className="ml-auto mt-[6.4px] block size-[10px] border-2 border-dotted" />
                          </span>
                          <span>
                            <span className="block text-body-ui font-bold text-ink">{template.label}</span>
                            <span className="block text-caption text-ink-muted">{template.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-label text-ink">Paper size</p>
                  <p className="mb-2 text-caption text-ink-muted">Presets refit the layout. Use custom dimensions for your own stock.</p>
                  <div className="inline-flex rounded-full bg-muted p-1" role="group" aria-label="ID card paper size">
                    {[{ label: "A6 portrait", active: isA6Portrait, paper: A6_PORTRAIT }, { label: "A6 landscape", active: isA6Landscape, paper: A6_LANDSCAPE }].map((option) => (
                      <button key={option.label} type="button" aria-pressed={option.active} onClick={() => updatePaper(option.paper)} className={cn("min-h-8 rounded-full px-3 text-[13px] font-semibold transition-colors", option.active ? "bg-canvas text-ink shadow-segment" : "text-ink-muted hover:text-ink")}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Width (mm)"><Input type="number" min={40} max={300} step={0.1} value={settings.widthMm} onChange={(event) => update({ widthMm: Number(event.target.value) })} /></Field>
                  <Field label="Height (mm)"><Input type="number" min={40} max={300} step={0.1} value={settings.heightMm} onChange={(event) => update({ heightMm: Number(event.target.value) })} /></Field>
                </div>
                <p className="text-body-ui text-ink-muted">All styles use high-contrast black and white for laser and thermal printing.</p>
              </TabsContent>

              <TabsContent value="2" className="flex flex-col gap-4 pt-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-label text-ink">Layout</h3>
                    <p className="text-body-ui text-ink-muted">Select an item on the card to edit it. Drag to move, or use arrow keys for small adjustments.</p>
                  </div>
                  <Button size="sm" variant="quiet" onClick={() => update({ elementPositions: defaultIdCardElementPositions(settings.template, settings.widthMm, settings.heightMm) })}>Reset layout</Button>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="mb-1.5 text-label text-ink">Snap grid</p>
                    <SegmentedControl
                      size="sm"
                      ariaLabel="ID card snap grid size"
                      value={String(settings.gridSizeMm)}
                      onValueChange={(value) => update({ gridSizeMm: Number(value) as IdCardPrintSettings["gridSizeMm"] })}
                      options={ID_CARD_GRID_SIZES_MM.map((size) => ({ value: String(size), label: `${size} mm` }))}
                    />
                  </div>
                  <SwitchField id="id-card-show-grid" label="Show grid" checked={settings.showGrid} onCheckedChange={(checked) => update({ showGrid: checked })} />
                </div>
                <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
                  <p className="text-label text-ink">Selected component</p>
                  <Field label="Component">
                    <Dropdown value={selectedLayoutElement} onChange={(event) => setSelectedLayoutElement(event.target.value as IdCardLayoutElement)}>
                      {Object.entries(LAYOUT_ELEMENT_LABELS).map(([element, label]) => <option key={element} value={element}>{label}</option>)}
                    </Dropdown>
                  </Field>
                  {selectedElementIsText ? (
                    <Field label="Text size (pt)"><Input type="number" min={6} max={48} step={0.5} value={settings.elementTextSizes[selectedLayoutElement]} onChange={(event) => updateElementTextSize(selectedLayoutElement, Number(event.target.value))} /></Field>
                  ) : (
                    <Field label="Square size (mm)"><Input type="number" min={10} max={settings.widthMm - 4} step={1} value={settings.elementSizes[selectedLayoutElement]} onChange={(event) => updateElementSize(selectedLayoutElement, Number(event.target.value))} /></Field>
                  )}
                  {selectedElementIsText ? <Field label="Text box width (mm)"><Input type="number" min={20} max={settings.widthMm - 4} step={1} value={settings.elementSizes[selectedLayoutElement]} onChange={(event) => updateElementSize(selectedLayoutElement, Number(event.target.value))} /></Field> : null}
                  {selectedElementIsText ? <SwitchField id="id-card-bold" label="Bold text" checked={settings.elementBold[selectedLayoutElement]} onCheckedChange={(checked) => update({ elementBold: { ...settings.elementBold, [selectedLayoutElement]: checked } })} /> : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="X position (mm)"><Input type="number" min={0} max={settings.widthMm} step={settings.gridSizeMm} value={selectedPosition.xMm} onChange={(event) => updateElementPosition(selectedLayoutElement, Number(event.target.value), selectedPosition.yMm)} /></Field>
                    <Field label="Y position (mm)"><Input type="number" min={0} max={settings.heightMm} step={settings.gridSizeMm} value={selectedPosition.yMm} onChange={(event) => updateElementPosition(selectedLayoutElement, selectedPosition.xMm, Number(event.target.value))} /></Field>
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Align selected component">
                    {([["left", "Left"], ["center", "Centre"], ["right", "Right"], ["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]] as const).map(([alignment, label]) => (
                      <Button key={alignment} size="sm" variant="secondary" onClick={() => alignSelectedElement(alignment)}>{label}</Button>
                    ))}
                    <Button size="sm" variant="quiet" onClick={resetSelectedElementPosition}>Reset component</Button>
                  </div>
                </div>
                {settings.elementSizes.qr < 20 ? <Callout tone="warning">Keep the QR code at least 20 mm square for reliable scanning after printing.</Callout> : null}
              </TabsContent>

              <TabsContent value="1" className="flex flex-col gap-4 pt-0">
                <div>
                  <h3 className="text-label text-ink">Make it your event</h3>
                  <p className="text-body-ui text-ink-muted">Names and QR codes update automatically for each attendee.</p>
                </div>
                <Field label="Card heading"><Input maxLength={120} value={settings.heading} onChange={(event) => update({ heading: event.target.value })} /></Field>
                <Field label="Badge label"><Input maxLength={40} value={settings.badgeLabel} onChange={(event) => update({ badgeLabel: event.target.value })} /></Field>
                <Field label="Footer text"><Input maxLength={80} value={settings.footerText} onChange={(event) => update({ footerText: event.target.value })} /></Field>
                <div className="flex flex-col gap-3 border-y border-line py-4">
                  <SwitchField id="id-card-logo" label={organisationLogoUrl ? "Include organisation logo" : "No organisation logo available"} disabled={!organisationLogoUrl} checked={settings.showLogo && !!organisationLogoUrl} onCheckedChange={(checked) => update({ showLogo: checked })} />
                  <SwitchField id="id-card-email" label="Include attendee email" checked={settings.showEmail} onCheckedChange={(checked) => update({ showEmail: checked })} />
                </div>
                <div>
                  <p className="text-label text-ink">Card fields</p>
                  <p className="mb-2 text-body-ui text-ink-muted">
                    Add the attendee details you want directly from this event&apos;s registration form—for example Organisation, Company, or Role.
                  </p>
                  {fieldOptions.length === 0 ? (
                    <Callout tone="warning">This event has no registration-form fields to add to the card yet.</Callout>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <Field label="Add registration field" helperText={availableFieldOptions.length === 0 ? "All registration fields are already on this card." : "Choose a field to add it to the card."}>
                        <Dropdown value="" onChange={(event) => togglePrintField(event.target.value, true)} disabled={availableFieldOptions.length === 0}>
                          <option value="" disabled>Select a registration field</option>
                          {availableFieldOptions.map((field) => (
                            <option key={field.key} value={field.key}>{field.label} · {field.detail}</option>
                          ))}
                        </Dropdown>
                      </Field>
                      {selectedFieldOptions.map((field) => (
                        <div key={field.key} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-body-ui font-bold text-ink">{field.label}</p>
                              <p className="text-caption text-ink-muted">{field.detail}</p>
                            </div>
                            <Button size="sm" variant="quiet" onClick={() => togglePrintField(field.key, false)}>Remove</Button>
                          </div>
                          <Field label="Printed label" helperText="Clear this to print the answer without a label.">
                            <Input maxLength={60} value={settings.printFieldLabels[field.key] ?? field.label} onChange={(event) => updatePrintFieldLabel(field.key, event.target.value)} />
                          </Field>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <div className="flex min-w-0 shrink-0 flex-col bg-subtle md:flex-1 md:overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <div>
                <p className="text-label text-ink">{cleanPreview ? "Print preview" : "Design canvas"}</p>
                <p className="text-caption text-ink-muted">{paperDescription} · {attendee ? "Attendee card" : "Sample attendee"}</p>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip content="Undo"><span><IconButton size="sm" label="Undo design change" disabled={!undoHistory.length} onClick={() => {
                  const previous = undoHistory[undoHistory.length - 1];
                  if (!previous) return;
                  setRedoHistory((history) => [...history, settings]);
                  setUndoHistory((history) => history.slice(0, -1));
                  update(previous, false);
                }}><Undo2 /></IconButton></span></Tooltip>
                <Tooltip content="Redo"><span><IconButton size="sm" label="Redo design change" disabled={!redoHistory.length} onClick={() => {
                  const next = redoHistory[redoHistory.length - 1];
                  if (!next) return;
                  setUndoHistory((history) => [...history, settings]);
                  setRedoHistory((history) => history.slice(0, -1));
                  update(next, false);
                }}><Redo2 /></IconButton></span></Tooltip>
                <Button size="sm" variant={cleanPreview ? "primary" : "secondary"} aria-pressed={cleanPreview} onClick={() => setCleanPreview(!cleanPreview)}>{cleanPreview ? "Back to editing" : "Preview"}</Button>
              </div>
            </div>
            <div className="grid min-h-[360px] flex-1 place-items-center overflow-auto p-4 sm:p-8" style={{ backgroundImage: "radial-gradient(circle, rgba(128,128,128,0.2) 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
              <div className="shrink-0" style={{ width: previewWidthPx }}>
                <div
                  data-id-card-preview
                  style={{
                    width: `${previewWidthPx}px`, aspectRatio: ratio, position: "relative", border: "2px solid #000", background: "#fff", color: "#000",
                    boxShadow: "0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12)", overflow: "hidden",
                    backgroundImage: settings.showGrid && !cleanPreview ? "linear-gradient(to right, rgb(0 0 0 / 8%) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 8%) 1px, transparent 1px)" : "none",
                    backgroundSize: `${settings.gridSizeMm * previewPixelsPerMillimetre}px ${settings.gridSizeMm * previewPixelsPerMillimetre}px`,
                    ...previewTemplateStyle,
                  }}
                >
                  {settings.template === "bold" ? <span aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 15, background: "#000" }} /> : null}
                  {!cleanPreview ? <span aria-hidden style={{ position: "absolute", inset: `${SAFE_MARGIN_MM * previewPixelsPerMillimetre}px`, border: "1px dashed rgb(0 0 0 / 25%)", pointerEvents: "none", zIndex: 0 }} /> : null}
                  <span aria-hidden style={{ display: cleanPreview ? "none" : "block", position: "absolute", left: `${selectedPosition.xMm * previewPixelsPerMillimetre}px`, top: `${Math.max(0, selectedPosition.yMm * previewPixelsPerMillimetre - 19)}px`, zIndex: 4, pointerEvents: "none", background: "#1976d2", color: "#fff", borderRadius: 6, padding: "0.8px 4px", fontSize: "0.6rem", fontWeight: 700, whiteSpace: "nowrap", fontFamily: "Inter, Arial, Helvetica, sans-serif" }}>{LAYOUT_ELEMENT_LABELS[selectedLayoutElement]} · {selectedPosition.xMm} × {selectedPosition.yMm} mm</span>
                  <div {...layoutItemProps("header")} className={previewOutlineClass("header")} style={{ ...previewPositionStyle("header"), width: previewItemWidth("header"), paddingBottom: 6, borderBottom: settings.template === "classic" ? "1px solid #000" : 0, borderTop: settings.template === "classic" ? 0 : "1px solid #000", paddingTop: settings.template === "classic" ? 0 : 6 }}>
                    <p style={{ margin: 0, fontSize: "0.62rem", letterSpacing: "0.14em", fontWeight: settings.elementBold.header ? 800 : 400 }}>{settings.badgeLabel}</p>
                    <p style={{ margin: 0, marginTop: settings.template === "minimal" ? 2 : 6, fontSize: previewTextSize("header"), fontWeight: settings.elementBold.header ? 700 : 400, lineHeight: 1.08, letterSpacing: "-0.025em", overflowWrap: "anywhere" }}>{settings.heading}</p>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logoUrl ? <img {...layoutItemProps("logo")} src={logoUrl} alt="" className={previewOutlineClass("logo")} style={{ ...previewPositionStyle("logo"), width: `${settings.elementSizes.logo * previewPixelsPerMillimetre}px`, height: `${settings.elementSizes.logo * previewPixelsPerMillimetre}px`, objectFit: "contain", borderRadius: 12, background: "#fff", padding: 2 }} /> : null}
                  <p {...layoutItemProps("name")} className={previewOutlineClass("name")} style={{ ...previewPositionStyle("name"), margin: 0, width: previewItemWidth("name"), fontSize: previewTextSize("name"), fontWeight: settings.elementBold.name ? 800 : 400, lineHeight: 1.12, letterSpacing: "-0.015em", textTransform: settings.template === "bold" ? "uppercase" : "none", overflowWrap: "anywhere" }}>{sampleAttendee.displayName}</p>
                  {settings.showEmail && sampleAttendee.email ? <p {...layoutItemProps("email")} className={previewOutlineClass("email")} style={{ ...previewPositionStyle("email"), margin: 0, width: previewItemWidth("email"), fontSize: previewTextSize("email"), fontWeight: settings.elementBold.email ? 700 : 400, opacity: 0.75, overflowWrap: "anywhere" }}>{sampleAttendee.email}</p> : null}
                  <div {...layoutItemProps("qr")} className={previewOutlineClass("qr")} style={{ ...previewPositionStyle("qr"), background: "#fff", padding: 4 }}>
                    <QRCode value={sampleAttendee.checkInQrToken} size={Math.round(settings.elementSizes.qr * previewPixelsPerMillimetre)} bgColor="#FFFFFF" fgColor="#000000" level="M" />
                  </div>
                  {previewFields.length > 0 ? (
                    <div {...layoutItemProps("details")} className={previewOutlineClass("details")} style={{ ...previewPositionStyle("details"), display: "flex", flexDirection: "column", gap: 3.2, width: previewItemWidth("details"), borderTop: settings.template === "minimal" ? 0 : "1px solid #000", paddingTop: settings.template === "minimal" ? 0 : 8 }}>
                      {previewFields.map((detail) => {
                        const label = settings.printFieldLabels[detail.key] ?? detail.label;
                        return (
                          <div key={detail.key} style={{ display: "flex", justifyContent: label ? "space-between" : "flex-start", gap: 8 }}>
                            {label ? <span style={{ fontSize: previewTextSize("details"), fontWeight: settings.elementBold.details ? 700 : 400, opacity: 0.72 }}>{label}</span> : null}
                            <span style={{ fontSize: previewTextSize("details"), fontWeight: settings.elementBold.details ? 700 : 400, textAlign: "right" }}>{detail.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <p {...layoutItemProps("footer")} className={previewOutlineClass("footer")} style={{ ...previewPositionStyle("footer"), margin: 0, width: previewItemWidth("footer"), fontSize: previewTextSize("footer"), fontWeight: settings.elementBold.footer ? 700 : 400, opacity: 0.68, overflowWrap: "anywhere" }}>{settings.footerText}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-line bg-canvas px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip size="sm" tone="outline">{cleanPreview ? "Guides hidden" : `${settings.gridSizeMm} mm snap`}</Chip>
                <p className="text-caption text-ink-muted">{cleanPreview ? "Grid and selection guides never print." : "Select to edit · Drag to move · Arrow keys to nudge"}</p>
              </div>
              <p className="text-caption text-ink-muted">Print at 100% / actual size. Match your printer’s paper to {paperDescription} and turn off headers and footers.</p>
            </div>
          </div>
        </div>
        {printError ? (
          <div className="px-4 pt-2">
            <Callout tone="danger" role="alert" action={<Button size="sm" variant="quiet" onClick={() => setPrintError(null)}>Dismiss</Button>}>{printError}</Callout>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
          <p className="basis-full text-caption text-ink-muted sm:mr-auto sm:basis-auto">Changes are kept in this browser for this event.{!attendee ? " Print a card after checking in an attendee." : ""}</p>
          <Button variant="secondary" onClick={onClose}>Done</Button>
          <Button variant="primary" startIcon={<Printer />} disabled={!attendee || printing} onClick={async () => {
            if (!attendee) return;
            setPrinting(true);
            setPrintError(null);
            try {
              const printed = await printCard({ settings, attendee, organisationLogoUrl });
              if (!printed) setPrintError("Could not open the print window. Allow pop-ups for this station and try again.");
            } catch {
              setPrintError("Could not prepare the card. Please try again.");
            } finally {
              setPrinting(false);
            }
          }}>{printing ? "Preparing…" : "Print ID card"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
