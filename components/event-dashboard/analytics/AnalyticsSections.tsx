import { DotColumns } from "@/components/dashboard/home/DotCharts";
import { cn } from "@/lib/cn";
import { formatDayShort } from "@/lib/format/datetime";
import type { FunnelStep, SignupTimeline } from "./metrics";

const card = "flex flex-col gap-4 rounded-xl border border-line bg-canvas p-5 sm:p-6";

function Dots({ count, total, className, dot = "size-2.5" }: { count: number; total: number; className: string; dot?: string }) {
  return (
    <span aria-hidden className="flex flex-wrap gap-1">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={cn("shrink-0 rounded-full", dot, index < count ? className : "bg-track")} />
      ))}
    </span>
  );
}

const FUNNEL_TONE: Record<FunnelStep["key"], string> = {
  responded: "bg-primary",
  going: "bg-accent",
  checkedIn: "bg-success-solid",
  feedback: "bg-brand-marigold",
};

/* ---------- Funnel ---------- */

export function FunnelCard({ steps, perDot, total }: { steps: FunnelStep[]; perDot: number; total: number }) {
  return (
    <section aria-labelledby="analytics-funnel-title" className={card}>
      <div>
        <h2 id="analytics-funnel-title" className="text-h4 text-ink">
          From sign-up to thank-you
        </h2>
        {perDot > 1 ? <p className="text-caption text-ink-muted">Each dot is about {perDot} people.</p> : null}
      </div>
      <ol className="flex flex-col gap-4">
        {steps.map((step) => (
          <li key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[8rem_minmax(0,1fr)_12rem]">
            <span className="font-semibold text-ink">{step.label}</span>
            <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
              <Dots count={step.dots} total={total} className={FUNNEL_TONE[step.key]} />
            </span>
            <span className="text-right">
              {step.value == null ? (
                <>
                  <span className="font-display text-xl font-extrabold text-ink-muted">—</span> <span className="text-caption text-ink-muted">after the event</span>
                </>
              ) : (
                <>
                  <strong className="font-display text-xl font-extrabold text-ink">{step.value}</strong>
                  {step.percent != null ? (
                    <span className="block text-caption text-ink-muted">
                      {step.percent}% of {step.of}
                    </span>
                  ) : step.note ? (
                    <span className="block text-caption text-ink-muted">{step.note}</span>
                  ) : null}
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- Status mix ---------- */

export type MixPart = { key: string; label: string; value: number; tone: string };

export function StatusMixCard({ parts, cells }: { parts: MixPart[]; cells: string[] }) {
  const tone = new Map(parts.map((part) => [part.key, part.tone]));
  const responded = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <section aria-labelledby="analytics-mix-title" className={card}>
      <div>
        <h2 id="analytics-mix-title" className="text-h4 text-ink">
          Everyone who responded
        </h2>
        <p className="text-caption text-ink-muted">
          {responded} {responded === 1 ? "response" : "responses"}
          {responded > cells.length ? `, shown as ${cells.length} dots` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <span aria-hidden className="grid grid-cols-10 gap-[5px]">
          {cells.map((key, index) => (
            <span key={index} className={cn("size-3.5 rounded-full", tone.get(key))} />
          ))}
        </span>
        <ul className="flex flex-col gap-2 text-sm">
          {parts.map((part) => (
            <li key={part.key} className="flex items-center gap-2 text-ink-secondary">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", part.tone)} />
              {part.label} <strong className="text-ink">{part.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Over time ---------- */

export function TimelineCard({ timeline, busiest, timeZone, now }: { timeline: SignupTimeline; busiest: { day: string; count: number } | null; timeZone: string; now: Date }) {
  const unit = timeline.intervalDays === 1 ? "day" : `${timeline.intervalDays} days`;
  return (
    <section aria-labelledby="analytics-time-title" className={card}>
      <div>
        <h2 id="analytics-time-title" className="text-h4 text-ink">
          When people signed up
        </h2>
        <p className="text-caption text-ink-muted">Each column is one {unit}.</p>
      </div>
      <DotColumns levels={timeline.levels} max={6} tone="marigold" dot={12} className="w-full justify-between" />
      <p className="sr-only">Sign-ups per {unit}, oldest first: {timeline.counts.join(", ")}.</p>
      <div aria-hidden className="flex justify-between gap-2 text-[11px] text-ink-muted">
        <span>{formatDayShort(timeline.start, timeZone, now)}</span>
        <span>{formatDayShort(timeline.end, timeZone, now)}</span>
      </div>
      {busiest && busiest.count > 1 ? (
        <p className="text-sm text-ink-secondary">
          Busiest day: {busiest.day} ({busiest.count} sign-ups).
        </p>
      ) : null}
    </section>
  );
}
