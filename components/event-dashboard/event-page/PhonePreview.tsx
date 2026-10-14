import { accentStyle } from "@/lib/theme/accent";

export type PreviewSection = { type: string; label: string; lines: Array<{ lead?: string; text: string }> };

/**
 * Presentational phone-sized sketch of the public event page, built from the
 * editor's in-progress state. Text only (no images, no iframe); the accent is
 * applied through `accentStyle`, which only ever emits a validated hex.
 */
export function PhonePreview({
  accent,
  title,
  dateLine,
  venueLine,
  registerLabel,
  sections,
  caption = "Updates as you change sections and colour.",
}: {
  accent: string;
  title: string;
  dateLine: string;
  venueLine: string;
  registerLabel: string;
  sections: PreviewSection[];
  caption?: string;
}) {
  return (
    <aside aria-label="Live preview" className="flex min-w-0 flex-col gap-2.5">
      <span className="text-overline text-ink-muted">Live preview · phone</span>
      <div className="yy-accent-scope w-[300px] max-w-full self-center overflow-hidden rounded-[36px] border-8 border-inverse bg-canvas shadow-raised" style={accentStyle(accent)}>
        <div
          aria-hidden
          className="h-28 bg-accent"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 2px, transparent 2.2px)", backgroundSize: "14px 14px" }}
        />
        <div className="flex flex-col gap-2 p-3.5">
          <span className="self-start rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-text">Free</span>
          <span className="wrap-break-word font-display text-[22px] font-extrabold leading-tight text-accent-text">{title.trim() || "Untitled event"}</span>
          <span className="text-xs text-ink-muted">{[dateLine, venueLine].filter(Boolean).join(" · ")}</span>
          <span className="mt-1 flex min-h-9 items-center justify-center rounded-full bg-accent px-3 text-center text-[13px] font-bold text-on-accent">{registerLabel}</span>
          {sections.length === 0 ? <span className="mt-2 text-xs italic text-ink-muted">No other sections are visible.</span> : null}
          {sections.map((section) => (
            <div key={section.type} className="mt-2 flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">{section.label}</span>
              {section.lines.map((line, index) => (
                <span key={index} className="flex min-w-0 gap-2 text-xs text-ink">
                  {line.lead ? <span className="w-14 shrink-0 text-ink-muted">{line.lead}</span> : null}
                  <span className="min-w-0 truncate font-semibold">{line.text}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <span className="text-center text-caption text-ink-muted">{caption}</span>
    </aside>
  );
}
