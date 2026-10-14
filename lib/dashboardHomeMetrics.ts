/**
 * Pure helpers for the dashboard home (app/dashboard/page.tsx). Kept free of
 * Prisma so they can be unit-tested; lib/dashboardHome.ts feeds them.
 */
import { formatRelativeDay } from "@/lib/format/datetime";

const DAY_MS = 86_400_000;

/**
 * Counts per rolling 24-hour window, oldest first, ending at `now`. Rolling
 * windows avoid guessing the viewer's timezone on the server.
 */
export function dailyCounts(dates: Date[], now: Date, days = 7): number[] {
  const counts = Array.from({ length: days }, () => 0);
  const end = now.getTime();
  for (const date of dates) {
    const age = end - date.getTime();
    if (age < 0 || age >= days * DAY_MS) continue;
    counts[days - 1 - Math.floor(age / DAY_MS)] += 1;
  }
  return counts;
}

/** Counts per 24-hour window looking ahead from `now`, soonest first (for upcoming dates). */
export function forwardDailyCounts(dates: Date[], now: Date, days = 7): number[] {
  const counts = Array.from({ length: days }, () => 0);
  for (const date of dates) {
    const ahead = date.getTime() - now.getTime();
    if (ahead < 0 || ahead >= days * DAY_MS) continue;
    counts[Math.floor(ahead / DAY_MS)] += 1;
  }
  return counts;
}

/** Counts per fixed interval starting at `start`, `buckets` long; later dates are ignored. */
export function intervalCounts(dates: Date[], start: Date, intervalMs: number, buckets: number): number[] {
  const counts = Array.from({ length: buckets }, () => 0);
  for (const date of dates) {
    const index = Math.floor((date.getTime() - start.getTime()) / intervalMs);
    if (index >= 0 && index < buckets) counts[index] += 1;
  }
  return counts;
}

/**
 * Scales counts to 0..`levels` dots per column for the little dot charts. Any
 * non-zero count shows at least one dot so quiet days stay visible.
 */
export function toDotLevels(counts: number[], levels = 4): number[] {
  const max = Math.max(0, ...counts);
  if (max === 0) return counts.map(() => 0);
  return counts.map((count) => (count === 0 ? 0 : Math.max(1, Math.round((count / max) * levels))));
}

/** "+20% on last week", "Same as last week", "New this week", or null when both weeks are empty. */
export function weekOverWeek(current: number, previous: number): string | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return "New this week";
  if (current === previous) return "Same as last week";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change > 0 ? "+" : ""}${change}% on last week`;
}

export type FillStatus = { label: string; tone: "success" | "warning" | "neutral" };

/** The chip on an event row: approvals first, then full/waitlist, then how many are going. */
export function eventFillStatus(counts: { confirmed: number; waitlisted: number; pending: number }, capacity: number | null): FillStatus {
  if (counts.pending > 0) return { label: `${counts.pending} to approve`, tone: "warning" };
  if (capacity != null && counts.confirmed >= capacity) {
    return { label: counts.waitlisted > 0 ? `Full · ${counts.waitlisted} waiting` : "Full", tone: "warning" };
  }
  if (capacity != null) return { label: `${counts.confirmed} / ${capacity} going`, tone: counts.confirmed > 0 ? "success" : "neutral" };
  return { label: `${counts.confirmed} going`, tone: counts.confirmed > 0 ? "success" : "neutral" };
}

export type TimedSession = { id: string; title: string; startDateTime: Date; endDateTime: Date; delayMinutes: number };

/** The session running now and the next one, using each session's live delay. */
export function nowAndNext<T extends TimedSession>(sessions: T[], now: Date): { now: (T & { start: Date; end: Date }) | null; next: (T & { start: Date; end: Date }) | null } {
  const shifted = sessions
    .map((session) => ({ ...session, start: new Date(session.startDateTime.getTime() + session.delayMinutes * 60_000), end: new Date(session.endDateTime.getTime() + session.delayMinutes * 60_000) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const current = shifted.find((session) => session.start <= now && session.end > now) ?? null;
  const next = shifted.find((session) => session.start > now) ?? null;
  return { now: current, next };
}

/** "today", "tomorrow", "in 9 days" or "on Wed 14 Oct", for use mid-sentence. */
export function relativeDayPhrase(value: Date, timeZone: string, now: Date): string {
  const phrase = formatRelativeDay(value, timeZone, now);
  if (phrase === "Today" || phrase === "Tomorrow" || phrase.startsWith("In ")) return phrase.charAt(0).toLowerCase() + phrase.slice(1);
  return `on ${phrase}`;
}

/** One friendly sentence under the greeting, built only from real numbers. */
export function homeSummary(input: {
  live: { title: string } | null;
  next: { title: string; startDateTime: Date; timezone: string } | null;
  signupsLastDay: number;
  now: Date;
}): string {
  const signups = input.signupsLastDay === 1 ? "1 person signed up" : `${input.signupsLastDay} people signed up`;
  if (input.live) {
    return input.signupsLastDay > 0 ? `${input.live.title} is happening now, and ${signups} in the last day.` : `${input.live.title} is happening now.`;
  }
  if (input.next) {
    const when = relativeDayPhrase(input.next.startDateTime, input.next.timezone, input.now);
    return input.signupsLastDay > 0 ? `${input.next.title} is ${when}, and ${signups} in the last day.` : `${input.next.title} is ${when}.`;
  }
  return "Nothing on the calendar yet. Your next event starts here.";
}
