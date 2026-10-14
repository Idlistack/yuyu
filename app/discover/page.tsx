import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { EventPrivacyType, EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Metadata } from "next";
import { PublicEventCard } from "@/components/events/PublicEventCard";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/display";
import { controlClasses } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import { INK_ACCENT } from "@/lib/theme/accent";
import { describeRecurrence, recurrenceChip } from "@/lib/format/recurrence";
import { parseDiscoveryDateRange } from "@/lib/dateFilter";
import { paginationWindow } from "@/lib/pagination";

export const metadata: Metadata = {
  title: "Discover Events",
  description:
    "Browse upcoming public events and find something worth attending.",
};

const PAGE_SIZE = 12;
const MAX_DISCOVERY_PAGES = 100;
const MAX_QUERY_LENGTH = 120;

type SearchParams = Promise<{
  sort?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
}>;

function buildQueryString(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sort = sp.sort === "popular" ? "popular" : "upcoming";
  const q = (sp.q?.trim() || "").slice(0, MAX_QUERY_LENGTH);
  const page = Math.min(MAX_DISCOVERY_PAGES, Math.max(1, parseInt(sp.page ?? "1", 10) || 1));

  const { fromDate, toExclusive, error: dateRangeError } = parseDiscoveryDateRange(sp.from, sp.to);

  const eventWhere = {
    status: EventStatus.PUBLISHED,
    privacyType: EventPrivacyType.PUBLIC,
    page: { is: { isPublished: true } },
    endDateTime: { gte: new Date() },
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(!dateRangeError && (fromDate || toExclusive) && {
      startDateTime: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toExclusive ? { lt: toExclusive } : {}),
      },
    }),
  } as const;

  const instanceWhere = {
    series: {
      status: EventStatus.PUBLISHED,
      privacyType: EventPrivacyType.PUBLIC,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    endDateTime: { gte: new Date() },
    ...(!dateRangeError && (fromDate || toExclusive) && {
      startDateTime: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toExclusive ? { lt: toExclusive } : {}),
      },
    }),
  };

  // Get total counts for pagination
  const [eventCount, instanceCount] = await Promise.all([
    prisma.event.count({ where: eventWhere }),
    prisma.eventInstance.count({ where: instanceWhere }),
  ]);
  const totalItems = eventCount + instanceCount;
  const totalPages = Math.min(MAX_DISCOVERY_PAGES, Math.max(1, Math.ceil(totalItems / PAGE_SIZE)));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const validFrom = dateRangeError ? null : fromDate;
  const validToExclusive = dateRangeError ? null : toExclusive;
  const searchPattern = `%${q}%`;
  const eventFilters = [
    Prisma.sql`e."status" = ${EventStatus.PUBLISHED}::"EventStatus"`,
    Prisma.sql`e."privacyType" = ${EventPrivacyType.PUBLIC}::"EventPrivacyType"`,
    Prisma.sql`EXISTS (SELECT 1 FROM "EventPage" ep WHERE ep."eventId" = e."id" AND ep."isPublished" = TRUE)`,
    Prisma.sql`e."endDateTime" >= NOW()`,
    ...(q ? [Prisma.sql`(e."title" ILIKE ${searchPattern} OR e."description" ILIKE ${searchPattern})`] : []),
    ...(validFrom ? [Prisma.sql`e."startDateTime" >= ${validFrom}`] : []),
    ...(validToExclusive ? [Prisma.sql`e."startDateTime" < ${validToExclusive}`] : []),
  ];
  const instanceFilters = [
    Prisma.sql`s."status" = ${EventStatus.PUBLISHED}::"EventStatus"`,
    Prisma.sql`s."privacyType" = ${EventPrivacyType.PUBLIC}::"EventPrivacyType"`,
    Prisma.sql`i."endDateTime" >= NOW()`,
    ...(q ? [Prisma.sql`(s."title" ILIKE ${searchPattern} OR s."description" ILIKE ${searchPattern})`] : []),
    ...(validFrom ? [Prisma.sql`i."startDateTime" >= ${validFrom}`] : []),
    ...(validToExclusive ? [Prisma.sql`i."startDateTime" < ${validToExclusive}`] : []),
  ];
  const ordering = sort === "popular"
    ? Prisma.sql`"popularity" DESC, "startDateTime" ASC, "id" ASC`
    : Prisma.sql`"startDateTime" ASC, "id" ASC`;
  const indexRows = await prisma.$queryRaw<Array<{ kind: "event" | "instance"; id: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT 'event'::text AS "kind", e."id", e."startDateTime",
        (SELECT COUNT(*)::int FROM "RSVP" r WHERE r."eventId" = e."id" AND r."status" = 'CONFIRMED'::"RsvpStatus") AS "popularity"
      FROM "Event" e
      WHERE ${Prisma.join(eventFilters, " AND ")}
      UNION ALL
      SELECT 'instance'::text AS "kind", i."id", i."startDateTime",
        (SELECT COUNT(*)::int FROM "RSVP" r WHERE r."eventInstanceId" = i."id" AND r."status" = 'CONFIRMED'::"RsvpStatus") AS "popularity"
      FROM "EventInstance" i
      INNER JOIN "EventSeries" s ON s."id" = i."eventSeriesId"
      WHERE ${Prisma.join(instanceFilters, " AND ")}
    )
    SELECT "kind", "id" FROM candidates
    ORDER BY ${ordering}
    LIMIT ${PAGE_SIZE} OFFSET ${startIdx}
  `);
  const eventIds = indexRows.filter((row) => row.kind === "event").map((row) => row.id);
  const instanceIds = indexRows.filter((row) => row.kind === "instance").map((row) => row.id);
  const [events, instances] = await Promise.all([
    prisma.event.findMany({ where: { id: { in: eventIds } }, include: { organisation: { select: { slug: true, name: true } }, page: { select: { accentColor: true } } } }),
    prisma.eventInstance.findMany({ where: { id: { in: instanceIds } }, include: { series: { include: { organisation: { select: { slug: true, name: true } } } } } }),
  ]);
  // Confirmed counts only for events whose organiser shows registration counts publicly.
  const countedEventIds = events.filter((event) => event.showRegistrationCount).map((event) => event.id);
  const goingRows = countedEventIds.length > 0
    ? await prisma.rSVP.groupBy({ by: ["eventId"], where: { eventId: { in: countedEventIds }, status: "CONFIRMED" }, _count: { _all: true } })
    : [];
  const goingByEvent = new Map(goingRows.map((row) => [row.eventId, row._count._all]));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const instancesById = new Map(instances.map((instance) => [instance.id, instance]));
  type PageItem =
    | { kind: "event"; id: string; orgSlug: string; event: (typeof events)[number] }
    | { kind: "instance"; id: string; orgSlug: string; instance: (typeof instances)[number] };
  const pageItems: PageItem[] = [];
  for (const row of indexRows) {
    if (row.kind === "event") {
      const event = eventsById.get(row.id);
      if (event) pageItems.push({ kind: "event", id: `e-${event.id}`, orgSlug: event.organisation.slug, event });
      continue;
    }
    const instance = instancesById.get(row.id);
    if (instance) pageItems.push({ kind: "instance", id: `i-${instance.id}`, orgSlug: instance.series.organisation.slug, instance });
  }

  const hasActiveFilters = q || sp.from || sp.to || sort !== "upcoming";

  // Build base params for pagination links (preserving current filters)
  const baseParams = {
    ...(q ? { q } : {}),
    ...(sort !== "upcoming" ? { sort } : {}),
    ...(sp.from ? { from: sp.from } : {}),
    ...(sp.to ? { to: sp.to } : {}),
  };

  const pageHref = (target: number) => `/discover${buildQueryString({ ...baseParams, page: String(target) })}`;
  const sortHref = (target: "upcoming" | "popular") => `/discover${buildQueryString({ ...(q ? { q } : {}), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), ...(target !== "upcoming" ? { sort: target } : {}) })}`;
  const clearSearchHref = `/discover${buildQueryString({ ...(sort !== "upcoming" ? { sort } : {}), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) })}`;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-display-m text-ink">Discover events</h1>
        <p className="mt-2 text-body-l text-ink-secondary">Free, public events from communities on Yuyu.</p>
      </header>

      <div className="flex flex-col gap-3.5">
        <form action="/discover" method="get" role="search" className="flex flex-col gap-2.5 lg:flex-row lg:items-end">
          {sort !== "upcoming" ? <input type="hidden" name="sort" value={sort} /> : null}
          <div className="relative min-w-0 flex-1">
            <label htmlFor="discover-q" className="sr-only">Search events</label>
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-muted" />
            <input id="discover-q" name="q" type="search" defaultValue={q} placeholder="Search events" maxLength={MAX_QUERY_LENGTH} className={cn(controlClasses, "h-[52px] rounded-full pl-11 pr-12 [&::-webkit-search-cancel-button]:appearance-none")} />
            {q ? (
              <Link href={clearSearchHref} aria-label="Clear search" className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-ink-muted hover:text-ink">
                <X aria-hidden className="size-4" />
              </Link>
            ) : null}
          </div>
          <fieldset className="flex gap-2.5">
            <legend className="sr-only">When</legend>
            <label className="flex min-w-0 flex-1 flex-col rounded-[18px] border border-line-strong px-4 py-1.5 focus-within:border-[var(--yy-focus)] lg:w-[170px] lg:flex-none">
              <span className="text-xs text-ink-muted">From</span>
              <input name="from" type="date" defaultValue={sp.from ?? ""} className="bg-transparent text-[15px] text-ink outline-none" />
            </label>
            <label className="flex min-w-0 flex-1 flex-col rounded-[18px] border border-line-strong px-4 py-1.5 focus-within:border-[var(--yy-focus)] lg:w-[170px] lg:flex-none">
              <span className="text-xs text-ink-muted">To</span>
              <input name="to" type="date" defaultValue={sp.to ?? ""} className="bg-transparent text-[15px] text-ink outline-none" />
            </label>
          </fieldset>
          <Button type="submit" variant="primary" size="lg" className="lg:h-[52px]">Search</Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Sort events" className="flex gap-2">
            {(["upcoming", "popular"] as const).map((option) => (
              <Link
                key={option}
                href={sortHref(option)}
                aria-current={sort === option ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors",
                  sort === option ? "border-[1.5px] border-primary bg-primary text-on-primary" : "border-line-strong bg-canvas text-ink-secondary hover:bg-subtle hover:text-ink",
                )}
              >
                {option === "upcoming" ? "Upcoming" : "Popular"}
              </Link>
            ))}
          </nav>
          {totalItems > 0 ? (
            <p className="text-sm text-ink-muted" aria-live="polite">
              {q ? <>{totalItems} {totalItems === 1 ? "event matches" : "events match"} “{q}”</> : <>Showing {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, totalItems)} of {totalItems} {totalItems === 1 ? "event" : "events"}</>}
              {totalPages > 1 ? <> · Page {safePage} of {totalPages}</> : null}
            </p>
          ) : null}
        </div>
      </div>

      {dateRangeError ? <Callout tone="warning" title={dateRangeError}>Date filtering was not applied.</Callout> : null}

      <h2 className="sr-only">{q ? "Search results" : "Upcoming events"}</h2>
      {pageItems.length === 0 ? (
        <EmptyState
          title="Nothing matches just yet"
          action={hasActiveFilters ? <Button asChild variant="secondary" size="sm"><Link href="/discover">Clear filters</Link></Button> : undefined}
        >
          Try clearing a filter or searching for something else.
        </EmptyState>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((row) => (
            <li key={row.id}>
              {row.kind === "event" ? (
                <PublicEventCard
                  event={{
                    href: `/${row.orgSlug}/${row.event.slug}`,
                    title: row.event.title,
                    startDateTime: row.event.startDateTime,
                    timezone: row.event.timezone,
                    location: row.event.location,
                    isOnline: row.event.isOnline,
                    coverImageUrl: row.event.coverImageUrl,
                    accentColor: row.event.page?.accentColor,
                    organisationName: row.event.organisation.name,
                    goingCount: row.event.showRegistrationCount ? goingByEvent.get(row.event.id) ?? 0 : null,
                  }}
                />
              ) : (
                <PublicEventCard
                  event={{
                    href: `/${row.orgSlug}/i/${row.instance.id}`,
                    title: row.instance.series.title,
                    startDateTime: row.instance.startDateTime,
                    timezone: row.instance.series.timezone,
                    fallbackAccent: INK_ACCENT,
                    organisationName: row.instance.series.organisation.name,
                    recurrenceChip: recurrenceChip(row.instance.series.recurrenceRule),
                    recurrenceText: describeRecurrence(row.instance.series.recurrenceRule),
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
          {safePage > 1 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={pageHref(safePage - 1)}><ChevronLeft aria-hidden className="size-4" />Previous</Link>
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled><ChevronLeft aria-hidden className="size-4" />Previous</Button>
          )}
          {paginationWindow(safePage, totalPages).map((p) => (
            <Link
              key={p}
              href={pageHref(p)}
              aria-current={p === safePage ? "page" : undefined}
              className={cn("inline-flex size-9 items-center justify-center rounded-full text-sm font-semibold", p === safePage ? "bg-primary text-on-primary" : "text-ink-secondary hover:bg-emphasis")}
            >
              {p}
            </Link>
          ))}
          {safePage < totalPages ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={pageHref(safePage + 1)}>Next<ChevronRight aria-hidden className="size-4" /></Link>
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled>Next<ChevronRight aria-hidden className="size-4" /></Button>
          )}
        </nav>
      ) : null}
    </div>
  );
}
