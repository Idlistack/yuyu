"use client";

import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import QRCode from "react-qr-code";
import { badgeLabelPt, type IdCardLayoutElement, type IdCardPrintSettings } from "@/lib/idCardPrint";
import { nameSizePt } from "./printCards";
import { ELEMENT_LABELS, printableFields, SAFE_MARGIN_MM, type IdCardAttendee } from "./shared";

const PT_TO_MM = 0.3528;

export type CanvasInteraction = {
  selected: IdCardLayoutElement | null;
  onSelect: (element: IdCardLayoutElement) => void;
  /** Called once when a drag or nudge starts, so it becomes one undo step. */
  onBeginChange: () => void;
  onMove: (element: IdCardLayoutElement, xMm: number, yMm: number) => void;
  showGrid: boolean;
};

/**
 * One badge drawn to scale (`pxPerMm`), matching the printed card. With
 * `interaction`, items can be selected, dragged and nudged with the arrow
 * keys (Shift for bigger steps); without it, it is a static preview.
 */
export function BadgeCanvas({
  settings,
  attendee,
  logoUrl,
  pxPerMm,
  interaction,
}: {
  settings: IdCardPrintSettings;
  attendee: IdCardAttendee;
  logoUrl: string | null;
  pxPerMm: number;
  interaction?: CanvasInteraction;
}) {
  const [drag, setDrag] = useState<{ element: IdCardLayoutElement; startX: number; startY: number; origin: { xMm: number; yMm: number } } | null>(null);
  const px = (mm: number) => `${mm * pxPerMm}px`;
  const ptPx = (pt: number) => `${pt * PT_TO_MM * pxPerMm}px`;
  const bold = settings.elementBold;
  const fields = printableFields(settings, attendee);
  const editing = Boolean(interaction);

  const itemStyle = (element: IdCardLayoutElement, extra: CSSProperties = {}): CSSProperties => ({
    position: "absolute",
    left: px(settings.elementPositions[element].xMm),
    top: px(settings.elementPositions[element].yMm),
    cursor: editing ? "grab" : undefined,
    touchAction: editing ? "none" : undefined,
    userSelect: editing ? "none" : undefined,
    zIndex: interaction?.selected === element ? 3 : 1,
    ...extra,
  });

  const itemProps = (element: IdCardLayoutElement) => {
    if (!interaction) return {};
    const selected = interaction.selected === element;
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `${ELEMENT_LABELS[element]}. Arrow keys move it; hold Shift for bigger steps.`,
      "aria-pressed": selected,
      "data-selected": selected ? "" : undefined,
      className: "outline-offset-2 hover:outline hover:outline-1 hover:outline-[#2563eb] focus-visible:outline-2 data-[selected]:outline data-[selected]:outline-2 data-[selected]:outline-[#2563eb]",
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        interaction.onSelect(element);
        interaction.onBeginChange();
        setDrag({ element, startX: event.clientX, startY: event.clientY, origin: settings.elementPositions[element] });
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!drag || drag.element !== element) return;
        interaction.onMove(element, drag.origin.xMm + (event.clientX - drag.startX) / pxPerMm, drag.origin.yMm + (event.clientY - drag.startY) / pxPerMm);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setDrag(null);
      },
      onPointerCancel: () => setDrag(null),
      onFocus: () => interaction.onSelect(element),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const step = event.shiftKey ? settings.gridSizeMm * 5 : settings.gridSizeMm;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        interaction.onBeginChange();
        const at = settings.elementPositions[element];
        interaction.onMove(element, at.xMm + move[0], at.yMm + move[1]);
      },
    };
  };

  const template = settings.template;
  const cardStyle: CSSProperties = {
    width: px(settings.widthMm),
    height: px(settings.heightMm),
    position: "relative",
    background: "#fff",
    color: "#000",
    overflow: "hidden",
    fontFamily: "Inter, Arial, Helvetica, sans-serif",
    border: template === "minimal" ? "1px solid #e5e5e5" : `${Math.max(1, (template === "bold" ? 1.2 : 0.6) * pxPerMm)}px solid #000`,
    backgroundImage: interaction?.showGrid
      ? "linear-gradient(to right, rgb(37 99 235 / 9%) 1px, transparent 1px), linear-gradient(to bottom, rgb(37 99 235 / 9%) 1px, transparent 1px)"
      : undefined,
    backgroundSize: interaction?.showGrid ? `${settings.gridSizeMm * pxPerMm}px ${settings.gridSizeMm * pxPerMm}px` : undefined,
  };

  const showHeader = (settings.showBadgeLabel && settings.badgeLabel.trim()) || settings.heading.trim();
  let headerRule: CSSProperties = {};
  if (template === "classic") headerRule = { paddingBottom: px(2), borderBottom: `${Math.max(1, 0.3 * pxPerMm)}px solid #000` };
  else if (template === "bold") headerRule = { paddingTop: px(4), borderTop: `${Math.max(1, 0.6 * pxPerMm)}px solid #000` };
  else headerRule = { paddingTop: px(4), borderTop: `${Math.max(1, 0.3 * pxPerMm)}px solid #000` };

  let content: ReactNode = (
    <>
      {template === "bold" ? <span aria-hidden style={{ position: "absolute", inset: 0, right: "auto", width: px(6), background: "#000" }} /> : null}
      {interaction ? (
        <span aria-hidden style={{ position: "absolute", inset: px(SAFE_MARGIN_MM), border: "1px dashed rgb(37 99 235 / 35%)", pointerEvents: "none" }} />
      ) : null}

      {showHeader ? (
        <div {...itemProps("header")} style={itemStyle("header", { width: px(settings.elementSizes.header), ...headerRule })}>
          {settings.showBadgeLabel && settings.badgeLabel.trim() ? (
            <p style={{ margin: `0 0 ${px(2.5)}`, fontSize: ptPx(badgeLabelPt(settings.elementTextSizes.header)), letterSpacing: "0.16em", fontWeight: bold.header ? 800 : 400 }}>{settings.badgeLabel}</p>
          ) : null}
          {settings.heading.trim() ? (
            <p style={{ margin: 0, fontSize: ptPx(settings.elementTextSizes.header), fontWeight: bold.header ? 700 : 400, lineHeight: 1.08, letterSpacing: "-0.025em", overflowWrap: "anywhere" }}>{settings.heading}</p>
          ) : null}
        </div>
      ) : null}

      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- organisation logo drawn to scale on the badge
        <img
          {...itemProps("logo")}
          src={logoUrl}
          alt=""
          draggable={false}
          style={itemStyle("logo", { width: px(settings.elementSizes.logo), height: px(settings.elementSizes.logo), objectFit: "contain", padding: px(1), borderRadius: px(3), filter: "grayscale(1) contrast(1.8)" })}
        />
      ) : null}

      <p
        {...itemProps("name")}
        style={itemStyle("name", {
          margin: 0,
          width: px(settings.elementSizes.name),
          fontSize: ptPx(nameSizePt(settings, attendee.displayName)),
          fontWeight: bold.name ? 700 : 400,
          lineHeight: 1.12,
          letterSpacing: "-0.015em",
          textTransform: template === "bold" ? "uppercase" : undefined,
          overflowWrap: "anywhere",
        })}
      >
        {attendee.displayName}
      </p>

      {settings.showEmail && attendee.email ? (
        <p {...itemProps("email")} style={itemStyle("email", { margin: 0, width: px(settings.elementSizes.email), fontSize: ptPx(settings.elementTextSizes.email), fontWeight: bold.email ? 700 : 400, overflowWrap: "anywhere" })}>
          {attendee.email}
        </p>
      ) : null}

      {fields.length > 0 ? (
        <div
          {...itemProps("details")}
          style={itemStyle("details", {
            width: px(settings.elementSizes.details),
            paddingTop: template === "minimal" ? 0 : px(3),
            borderTop: template === "minimal" ? 0 : `${Math.max(1, (template === "bold" ? 0.6 : 0.3) * pxPerMm)}px solid #000`,
          })}
        >
          {fields.map((detail) => {
            const label = settings.printFieldLabels[detail.key] ?? detail.label;
            return (
              <div key={detail.key} style={{ display: "flex", justifyContent: label ? "space-between" : "flex-start", gap: px(4), marginTop: px(1.5), fontSize: ptPx(settings.elementTextSizes.details) }}>
                {label ? <span style={{ fontWeight: bold.details ? 700 : 400 }}>{label}</span> : null}
                <span style={{ fontWeight: bold.details ? 700 : 400, textAlign: "right", overflowWrap: "anywhere" }}>{detail.value}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div {...itemProps("qr")} style={itemStyle("qr", { background: "#fff", padding: px(1), zIndex: interaction?.selected === "qr" ? 3 : 2 })}>
        <QRCode value={attendee.checkInQrToken} size={Math.max(16, Math.round(settings.elementSizes.qr * pxPerMm))} bgColor="#FFFFFF" fgColor="#000000" level="M" />
      </div>

      {settings.showFooter && settings.footerText.trim() ? (
        <p {...itemProps("footer")} style={itemStyle("footer", { margin: 0, width: px(settings.elementSizes.footer), fontSize: ptPx(settings.elementTextSizes.footer), fontWeight: bold.footer || template === "bold" ? 700 : 400, overflowWrap: "anywhere" })}>
          {settings.footerText}
        </p>
      ) : null}
    </>
  );

  if (!interaction) content = <div aria-hidden>{content}</div>;
  return (
    <div data-id-card-preview style={cardStyle} className="shrink-0 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
      {content}
    </div>
  );
}
