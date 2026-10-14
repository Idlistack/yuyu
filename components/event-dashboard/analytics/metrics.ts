/**
 * Pure helpers for the event Analytics tab's dot charts. Free of Prisma and
 * React so they can be unit-tested. Every number comes from real counts.
 */
import { intervalCounts, toDotLevels } from "@/lib/dashboardHomeMetrics";
import { formatDate } from "@/lib/format/datetime";

const DAY_MS = 86_400_000;

/** People per dot so the largest value fits in `maxDots` (1 when it already fits). */
export function peoplePerDot(largest: number, maxDots: number): number {
  if (largest <= maxDots) return 1;
  return Math.ceil(largest / maxDots);
}

/** Dots for a count at `perDot` people per dot; any non-zero count shows at least one. */
export function dotsFor(value: number, perDot: number): number {
  if (value <= 0) return 0;
  return Math.max(1, Math.round(value / perDot));
}

export type FunnelStep = {
  key: "responded" | "going" | "checkedIn" | "feedback";
  label: string;
  /** Null when the step only happens after the event and nothing is recorded yet. */
  value: number | null;
  dots: number;
  /** Share of the previous step, as a whole percentage. */
  percent: number | null;
  of: string | null;
};

/** "From sign-up to thank-you": responded → going → checked in → gave feedback. */
export function funnelSteps(input: { responded: number; going: number; checkedIn: number; feedback: number; ended: boolean }, maxDots = 60): { steps: FunnelStep[]; perDot: number; total: number } {
  const perDot = peoplePerDot(input.responded, maxDots);
  const later = (value: number) => (input.ended || value > 0 ? value : null);
  const raw: Array<Omit<FunnelStep, "dots" | "percent" | "of">> = [
    { key: "responded", label: "Responded", value: input.responded },
    { key: "going", label: "Going", value: input.going },
    { key: "checkedIn", label: "Checked in", value: later(input.checkedIn) },
    { key: "feedback", label: "Gave feedback", value: later(input.feedback) },
  ];
  const steps = raw.map((step, index) => {
    const previous = index > 0 ? raw[index - 1]! : null;
    const percent = previous && step.value != null && previous.value != null && previous.value > 0 ? Math.round((step.value / previous.value) * 100) : null;
    return { ...step, dots: step.value == null ? 0 : dotsFor(step.value, perDot), percent, of: previous && percent != null ? previous.label.toLowerCase() : null };
  });
  return { steps, perDot, total: Math.max(1, Math.ceil(input.responded / perDot)) };
}

/**
 * Splits `cells` dots between parts in proportion to their values (largest
 * remainder), one dot per person when everyone fits. Returns the part key
 * for each cell in order.
 */
export function waffleCells<K extends string>(parts: Array<{ key: K; value: number }>, cells = 100): K[] {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  if (total === 0) return [];
  if (total <= cells) return parts.flatMap((part) => Array.from({ length: Math.max(0, part.value) }, () => part.key));
  const exact = parts.map((part) => (Math.max(0, part.value) / total) * cells);
  const counts = exact.map((value, index) => {
    const floor = Math.floor(value);
    // Keep every non-empty status visible.
    return parts[index]!.value > 0 ? Math.max(1, floor) : 0;
  });
  let remaining = cells - counts.reduce((sum, count) => sum + count, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; remaining > 0 && order.length > 0; i = (i + 1) % order.length) {
    const { index } = order[i]!;
    if (parts[index]!.value > 0) {
      counts[index]! += 1;
      remaining -= 1;
    }
  }
  while (remaining < 0) {
    const largest = counts.indexOf(Math.max(...counts));
    counts[largest]! -= 1;
    remaining += 1;
  }
  return parts.flatMap((part, index) => Array.from({ length: counts[index]! }, () => part.key));
}

export type SignupTimeline = { counts: number[]; levels: number[]; start: Date; end: Date; intervalDays: number; total: number };

/**
 * Sign-ups over time in at most `maxBuckets` columns, from the first sign-up
 * to `until` (now, or the event's end if earlier). Null when nobody signed up.
 */
export function signupTimeline(dates: Date[], until: Date, maxBuckets = 14, maxDots = 6): SignupTimeline | null {
  const inRange = dates.filter((date) => date.getTime() <= until.getTime());
  if (inRange.length === 0) return null;
  const first = Math.min(...inRange.map((date) => date.getTime()));
  const spanDays = Math.max(1, Math.ceil((until.getTime() - first + 1) / DAY_MS));
  const intervalDays = Math.max(1, Math.ceil(spanDays / maxBuckets));
  const buckets = Math.max(1, Math.ceil(spanDays / intervalDays));
  // Align the last bucket to end at `until` so the newest sign-ups are in the last column.
  const start = new Date(until.getTime() - buckets * intervalDays * DAY_MS + 1);
  const counts = intervalCounts(inRange, start, intervalDays * DAY_MS, buckets);
  return { counts, levels: toDotLevels(counts, maxDots), start, end: until, intervalDays, total: inRange.length };
}

/** The calendar day (in the event's timezone) with the most sign-ups; earliest wins a tie. */
export function busiestDay(dates: Date[], timeZone: string): { day: string; count: number } | null {
  const byDay = new Map<string, { count: number; first: number }>();
  for (const date of dates) {
    const key = formatDate(date, timeZone);
    const entry = byDay.get(key);
    if (entry) {
      entry.count += 1;
      entry.first = Math.min(entry.first, date.getTime());
    } else byDay.set(key, { count: 1, first: date.getTime() });
  }
  let best: { day: string; count: number; first: number } | null = null;
  for (const [day, entry] of byDay) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.first < best.first)) best = { day, ...entry };
  }
  return best ? { day: best.day, count: best.count } : null;
}
