"use client";

import { Ban, CheckCircle2, Hourglass, ListPlus, QrCode, TrendingUp, Users } from "lucide-react";
import { Card, Chip, StatTile } from "@/components/ui/display";
import { cn } from "@/lib/cn";

type Analytics = {
  total: number;
  confirmed: number;
  waitlisted: number;
  pendingApproval: number;
  rejected: number;
  checkedIn: number;
};

function pct(num: number, den: number) {
  if (!den || den <= 0) return 0;
  return Math.max(0, Math.min(100, (num / den) * 100));
}

function fmtPct(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

// Status colours come from the V1 status tokens so the chart follows light/dark mode.
const SERIES = {
  confirmed: { label: "Confirmed", stroke: "stroke-success-solid", fill: "bg-success-solid", text: "text-success-fg" },
  pending: { label: "Pending", stroke: "stroke-warning-solid", fill: "bg-warning-solid", text: "text-warning-fg" },
  waitlisted: { label: "Waitlisted", stroke: "stroke-primary", fill: "bg-primary", text: "text-ink" },
  rejected: { label: "Rejected", stroke: "stroke-danger-solid", fill: "bg-danger-solid", text: "text-danger-fg" },
  other: { label: "Other", stroke: "stroke-line-strong", fill: "bg-line-strong", text: "text-ink-muted" },
} as const;
type SeriesKey = keyof typeof SERIES;

function DonutChart(props: { size?: number; thickness?: number; parts: { key: SeriesKey; value: number }[] }) {
  const { size = 160, thickness = 16, parts } = props;
  const total = parts.reduce((acc, p) => acc + Math.max(0, p.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const center = size / 2;
  const summary = parts.map((p) => `${SERIES[p.key].label} ${p.value}`).join(", ");

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Responses by status: ${summary}`}>
        <circle cx={center} cy={center} r={r} fill="none" className="stroke-track" strokeWidth={thickness} />
        {total > 0
          ? parts.map((p) => {
              const v = Math.max(0, p.value);
              const seg = (v / total) * c;
              const el = (
                <circle
                  key={p.key}
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  className={SERIES[p.key].stroke}
                  strokeWidth={thickness}
                  strokeDasharray={`${seg} ${c - seg}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${center} ${center})`}
                />
              );
              offset += seg + 2; // tiny gap
              return el;
            })
          : null}
      </svg>
      <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[28px] font-extrabold leading-none text-ink">{total}</span>
        <span className="text-caption text-ink-muted">responses</span>
      </div>
    </div>
  );
}

function SparkBars(props: { values: { key: SeriesKey; value: number }[] }) {
  const { values } = props;
  const m = values.reduce((acc, v) => Math.max(acc, Math.max(0, v.value)), 0);
  return (
    <div className="flex items-end gap-1.5">
      {values.map((v) => {
        const h = m > 0 ? Math.max(6, Math.round((Math.max(0, v.value) / m) * 46)) : 6;
        return <span key={v.key} title={`${SERIES[v.key].label}: ${v.value}`} className={cn("block w-2.5 rounded-full", SERIES[v.key].fill, v.value > 0 ? "opacity-95" : "opacity-35")} style={{ height: h }} />;
      })}
    </div>
  );
}

function PipelineRow({ label, value, total, series }: { label: string; value: number; total: number; series: SeriesKey }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-body-ui">
        <span className="text-ink-secondary">{label}</span>
        <span className="font-bold text-ink">{value}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct(value, total))} className="h-2.5 overflow-hidden rounded-full bg-track">
        <div className={cn("h-full rounded-full transition-[width] duration-[360ms] ease-yy", SERIES[series].fill)} style={{ width: `${pct(value, total)}%` }} />
      </div>
    </div>
  );
}

export function EventAnalyticsPanel(props: { analytics: Analytics }) {
  const { analytics } = props;

  const nonConfirmed = analytics.total - analytics.confirmed - analytics.waitlisted - analytics.pendingApproval - analytics.rejected;
  const other = Math.max(0, nonConfirmed);

  const checkInRate = pct(analytics.checkedIn, analytics.confirmed);
  const confirmRate = pct(analytics.confirmed, analytics.total);
  const waitlistRate = pct(analytics.waitlisted, analytics.total);
  const pendingRate = pct(analytics.pendingApproval, analytics.total);

  const rates: Array<{ key: SeriesKey; icon: typeof CheckCircle2; value: string }> = [
    { key: "confirmed", icon: CheckCircle2, value: analytics.total > 0 ? fmtPct(confirmRate) : "—" },
    { key: "pending", icon: Hourglass, value: analytics.total > 0 ? fmtPct(pendingRate) : "—" },
    { key: "waitlisted", icon: ListPlus, value: analytics.total > 0 ? fmtPct(waitlistRate) : "—" },
    { key: "rejected", icon: Ban, value: String(analytics.rejected) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <TrendingUp aria-hidden className="mt-1 size-5 text-ink-muted" />
          <div>
            <h2 className="text-h3 text-ink">Analytics</h2>
            <p className="text-body-ui text-ink-muted">Live snapshot of RSVPs and check-ins.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="outline" icon={<Users />}>{analytics.total} responses</Chip>
          <Chip tone="outline" icon={<QrCode />}>{analytics.confirmed > 0 ? `${fmtPct(checkInRate)} check-in rate` : "— check-in rate"}</Chip>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total responses" value={analytics.total} hint="RSVP submissions so far" />
        <StatTile label="Confirmed" value={analytics.confirmed} hint={analytics.total > 0 ? `${fmtPct(confirmRate)} of responses` : "—"} />
        <StatTile label="Checked in" value={analytics.checkedIn} hint={analytics.confirmed > 0 ? `${fmtPct(checkInRate)} of confirmed` : "—"} progress={analytics.confirmed > 0 ? { value: analytics.checkedIn, max: analytics.confirmed, tone: "success" } : undefined} />
        <StatTile label="Needs action" value={analytics.pendingApproval} hint="Pending approvals" tone={analytics.pendingApproval > 0 ? "attention" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card>
          <h3 className="text-h4 text-ink">RSVP pipeline</h3>
          <p className="mt-1 text-body-ui text-ink-muted">Confirmed, waiting, pending, and rejected at a glance.</p>
          <div className="mt-4 flex flex-col gap-3.5 border-t border-line pt-4">
            <PipelineRow label="Confirmed" value={analytics.confirmed} total={analytics.total} series="confirmed" />
            <PipelineRow label="Pending approval" value={analytics.pendingApproval} total={analytics.total} series="pending" />
            <PipelineRow label="Waitlisted" value={analytics.waitlisted} total={analytics.total} series="waitlisted" />
            <PipelineRow label="Rejected" value={analytics.rejected} total={analytics.total} series="rejected" />
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <div>
            <h3 className="text-h4 text-ink">Distribution</h3>
            <p className="mt-1 text-body-ui text-ink-muted">Breakdown of responses by status.</p>
          </div>
          <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col">
            <DonutChart
              parts={[
                { key: "confirmed", value: analytics.confirmed },
                { key: "pending", value: analytics.pendingApproval },
                { key: "waitlisted", value: analytics.waitlisted },
                { key: "rejected", value: analytics.rejected },
                { key: "other", value: other },
              ]}
            />
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                <span className="text-caption text-ink-muted">Quick view</span>
                <SparkBars
                  values={[
                    { key: "confirmed", value: analytics.confirmed },
                    { key: "pending", value: analytics.pendingApproval },
                    { key: "waitlisted", value: analytics.waitlisted },
                    { key: "rejected", value: analytics.rejected },
                  ]}
                />
              </div>
              <ul className="flex flex-col gap-1.5">
                {rates.map((rate) => {
                  const Icon = rate.icon;
                  return (
                    <li key={rate.key} className="flex items-center justify-between text-body-ui">
                      <span className="flex items-center gap-2 text-ink-secondary">
                        <Icon aria-hidden className={cn("size-[18px]", SERIES[rate.key].text)} />
                        {SERIES[rate.key].label}
                      </span>
                      <span className="font-bold text-ink">{rate.value}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
