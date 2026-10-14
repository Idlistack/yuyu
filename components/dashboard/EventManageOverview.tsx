"use client";

import type { EventClientDto } from "@/lib/eventDto";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarCog, ChevronRight, Mail, QrCode, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Callout, Card, Chip, DetailList, StatTile, type ChipTone } from "@/components/ui/display";
import { formatRelativeTime } from "@/lib/format/datetime";
import type { AttendeeRow } from "@/components/attendees/AttendeeTable";
import { PublishEventButton } from "@/components/event/PublishEventButton";

function asDate(value: EventClientDto["startDateTime"]): Date {
  return value instanceof Date ? value : new Date(value as string);
}

// This client component is pre-rendered on the server. Keep the locale and
// timezone explicit so browser locale settings cannot change its first render.
const DASHBOARD_DATE_LOCALE = "en-GB";

function formatDashboardDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return date.toLocaleString(DASHBOARD_DATE_LOCALE, options);
}

function calendarDayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat(DASHBOARD_DATE_LOCALE, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return parts
    .filter((part) => part.type !== "literal")
    .map((part) => part.value)
    .join("-");
}

function formatRecapWhen(start: Date, end: Date, timeZone: string) {
  const primary = formatDashboardDate(start, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
  const endT =
    calendarDayKey(start, timeZone) === calendarDayKey(end, timeZone)
      ? formatDashboardDate(end, {
          hour: "numeric",
          minute: "2-digit",
          timeZone,
        })
      : formatDashboardDate(end, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone,
        });
  return { primary, endHint: `Ends ${endT}` };
}

function privacyLabel(p: EventClientDto["privacyType"]) {
  switch (p) {
    case "PUBLIC":
      return "Public";
    case "HIDDEN_LINK":
      return "Hidden link";
    case "APPROVAL_REQUIRED":
      return "Approval required";
    case "INVITE_ONLY":
      return "Invite only";
    default:
      return p;
  }
}

function statusLabel(s: AttendeeRow["status"]) {
  switch (s) {
    case "CONFIRMED":
      return "Confirmed";
    case "WAITLISTED":
      return "Waitlisted";
    case "PENDING_APPROVAL":
      return "Pending";
    case "REJECTED":
      return "Rejected";
    default:
      return s;
  }
}

function attendeeLabel(row: AttendeeRow) {
  return row.user?.name?.trim() || row.user?.email || row.guestEmail || "Guest";
}

function attendeeEmail(row: AttendeeRow) {
  return row.user?.email ?? row.guestEmail ?? "—";
}

function statusTone(s: AttendeeRow["status"]): ChipTone {
  switch (s) {
    case "CONFIRMED":
      return "success";
    case "WAITLISTED":
    case "PENDING_APPROVAL":
      return "warning";
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
}

/** Overview shortcuts open these tabs of the event manager. */
export type OverviewTab = "details" | "guests" | "analytics" | "invites" | "check-in";

type InviteRow = { id: string; email: string; createdAt: string };

export function EventManageOverview(props: {
  organisationSlug: string;
  event: EventClientDto;
  analytics: {
    total: number;
    confirmed: number;
    waitlisted: number;
    pendingApproval: number;
    rejected: number;
    checkedIn: number;
  };
  invites: InviteRow[];
  recentRegistrations: AttendeeRow[];
  referenceTime: string;
  onOpenTab: (tab: OverviewTab) => void;
}) {
  const { organisationSlug, event, analytics, invites, recentRegistrations, referenceTime, onOpenTab } =
    props;
  const start = asDate(event.startDateTime);
  const end = asDate(event.endDateTime);
  const now = new Date(referenceTime);
  const hasEnded = end < now;
  const isDraft = event.status === "DRAFT";

  const { primary: whenPrimary, endHint } = formatRecapWhen(
    start,
    end,
    event.timezone,
  );

  const cap = event.capacity ?? null;
  const fillPct =
    cap && cap > 0
      ? Math.min(100, Math.round((analytics.confirmed / cap) * 100))
      : null;

  const publicHref = `/${organisationSlug}/${event.slug}`;

  const shortcuts: Array<{ tab: OverviewTab; title: string; description: string; icon: typeof Users }> = [
    { tab: "details", title: "Details", description: "Title, schedule, location, cover image, and publishing.", icon: CalendarCog },
    { tab: "guests", title: "Attendees", description: "RSVPs, approvals, waitlist, and guest management.", icon: Users },
    { tab: "analytics", title: "Analytics", description: "Response counts and pipeline at a glance.", icon: TrendingUp },
    { tab: "invites", title: "Invites", description: "Email invites and outreach for this event.", icon: Mail },
    { tab: "check-in", title: "Check-in", description: "QR scanning, manual codes, search, and attendance export.", icon: QrCode },
  ];

  const shortDate = (value: string) =>
    formatDashboardDate(new Date(value), { month: "short", day: "numeric", year: "numeric", timeZone: event.timezone });

  return (
    <div className="flex flex-col gap-6">
      {isDraft ? (
        <Callout
          tone="warning"
          title="This event is currently in Draft"
          action={
            <>
              <Button size="sm" variant="secondary" onClick={() => onOpenTab("details")}>
                Edit details
              </Button>
              <PublishEventButton organisationSlug={organisationSlug} eventSlug={event.slug} />
            </>
          }
        >
          Publish this event to allow guests to register, view details, and receive tickets.
        </Callout>
      ) : null}
      {hasEnded && !isDraft ? <Callout tone="success">This event has ended. Thank you for hosting.</Callout> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Going"
          value={
            <>
              {analytics.confirmed}
              {cap != null ? <span className="text-lg font-bold text-ink-muted"> / {cap}</span> : null}
            </>
          }
          hint={fillPct == null ? "Set a capacity in Details to track fill." : `${analytics.total} total responses`}
          progress={cap != null && cap > 0 ? { value: analytics.confirmed, max: cap, tone: fillPct != null && fillPct >= 100 ? "warning" : "accent" } : undefined}
        />
        <StatTile label="Waitlist" value={analytics.waitlisted} />
        <StatTile label="Waiting for approval" value={analytics.pendingApproval} tone={analytics.pendingApproval > 0 ? "attention" : "default"} hint={analytics.rejected > 0 ? `${analytics.rejected} rejected` : undefined} />
        <StatTile label="Invites sent" value={invites.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="latest-registrations">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="latest-registrations" className="text-h3 text-ink">Latest registrations</h2>
              <button type="button" onClick={() => onOpenTab("guests")} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-ink underline underline-offset-4">
                All guests <ArrowRight aria-hidden className="size-4" />
              </button>
            </div>
            {recentRegistrations.length === 0 ? (
              <Card padding="md">
                <p className="text-body-ui text-ink-muted">No registrations yet. Share your event page to collect RSVPs.</p>
              </Card>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-canvas">
                {recentRegistrations.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={attendeeLabel(row)} size="md" tone={statusTone(row.status) === "success" ? "success" : statusTone(row.status) === "warning" ? "warning" : "neutral"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{attendeeLabel(row)}</p>
                      <p className="truncate text-sm text-ink-muted">{attendeeEmail(row)}</p>
                    </div>
                    <Chip size="sm" tone={statusTone(row.status)} className="hidden sm:inline-flex">{statusLabel(row.status)}</Chip>
                    <span className="hidden w-24 shrink-0 text-right text-sm text-ink-muted md:block" title={shortDate(row.createdAt)}>
                      {formatRelativeTime(row.createdAt, event.timezone, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Card as="section" aria-labelledby="overview-invites">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="overview-invites" className="text-h4 text-ink">Invites</h2>
                <p className="mt-1 text-body-ui text-ink-muted">Invite subscribers and contacts by email. Track outreach from the Invites tab.</p>
                <p className="mt-2 text-body-ui text-ink"><strong>{invites.length}</strong> email invites sent</p>
              </div>
              <Button variant="primary" onClick={() => onOpenTab("invites")} className="shrink-0">
                Invite guests
              </Button>
            </div>
            {invites.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1 text-overline text-ink-muted">Recent invitations</p>
                <ul className="divide-y divide-line">
                  {invites.slice(0, 5).map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-body-ui text-ink">{inv.email}</span>
                      <span className="shrink-0 text-caption text-ink-muted">{shortDate(inv.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="at-a-glance">
            <h2 id="at-a-glance" className="mb-3 text-h3 text-ink">At a glance</h2>
            <Card padding="md">
              <DetailList
                className="sm:grid-cols-[max-content_minmax(0,1fr)]"
                items={[
                  { label: "When", value: <>{whenPrimary}<span className="block text-caption text-ink-muted">{endHint}</span></> },
                  { label: "Where", value: event.isOnline ? "Online event" : event.location.trim() || "Location TBD" },
                  { label: "Who can join", value: privacyLabel(event.privacyType) },
                  ...(event.status !== "PUBLISHED" ? [{ label: "Status", value: event.status }] : []),
                  { label: "Capacity", value: cap ?? "—" },
                ]}
              />
            </Card>
          </section>

          <section aria-labelledby="manage-shortcuts">
            <h2 id="manage-shortcuts" className="mb-3 text-h3 text-ink">Manage this event</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-canvas">
              {shortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <li key={shortcut.tab}>
                    <button type="button" onClick={() => onOpenTab(shortcut.tab)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle">
                      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-ink">{shortcut.title}</span>
                        <span className="block text-sm text-ink-muted">{shortcut.description}</span>
                      </span>
                      <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <Card padding="sm" className="flex flex-col gap-3">
            <p className="text-body-ui text-ink-secondary">Preview the public event page as guests see it.</p>
            <Button asChild variant="secondary" className="self-start">
              <Link href={publicHref}>
                Event page
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
