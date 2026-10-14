import Link from "next/link";
import { ChevronLeft, ChevronRight, Repeat, Settings } from "lucide-react";
import { EventStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  canManageEvents,
  isOrgAdmin,
  requireOrgDashboardAccess,
} from "@/lib/permissions";
import { EventCard } from "@/components/event/EventCard";
import { CreateEventDialog } from "@/components/event/CreateEventDialog";
import { CreateSeriesDialog } from "@/components/series/CreateSeriesDialog";
import { paginationWindow } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { NavTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";

import type { Metadata } from "next";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string; seriesPage?: string; view?: string }>;
};

const EVENT_PAGE_SIZE = 6;
const SERIES_PAGE_SIZE = 6;
type EventView = "upcoming" | "past" | "draft" | "all";

function dashboardQuery(params: {
  view: EventView;
  page?: number;
  seriesPage?: number;
}) {
  const query = new URLSearchParams();
  if (params.view !== "all") query.set("view", params.view);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.seriesPage && params.seriesPage > 1)
    query.set("seriesPage", String(params.seriesPage));
  const value = query.toString();
  return value ? `?${value}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug } = await params;
  const org = await prisma.organisation.findUnique({
    where: { slug: orgSlug },
    select: { name: true },
  });
  return {
    title: org ? `${org.name} Dashboard` : "Dashboard",
  };
}

export default async function OrgDashboardPage({
  params,
  searchParams,
}: Props) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const seriesPage = Math.max(1, parseInt(sp.seriesPage ?? "1", 10) || 1);
  const view: EventView = ["upcoming", "past", "draft", "all"].includes(
    sp.view ?? "",
  )
    ? (sp.view as EventView)
    : "all";

  const access = await requireOrgDashboardAccess(orgSlug);
  const { organisation, membership } = access;
  if (!membership) {
    const grants = await prisma.eventCollaborator.findMany({
      where: {
        userId: access.userId,
        OR: [
          { event: { organisationId: organisation.id } },
          { series: { organisationId: organisation.id } },
        ],
      },
      include: { event: true, series: true },
    });
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={organisation.name} description="Your assigned events" />
        <ul className="flex flex-col gap-2.5">
          {grants.map((grant) =>
            grant.event ? (
              <li key={grant.id}>
                <Link
                  href={`/dashboard/${organisation.slug}/event/${grant.event.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-4 font-semibold text-ink transition-colors hover:bg-subtle"
                >
                  {grant.event.title}
                  <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                </Link>
              </li>
            ) : grant.series ? (
              <li key={grant.id}>
                <Link
                  href={`/dashboard/${organisation.slug}/series/${grant.series.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-4 font-semibold text-ink transition-colors hover:bg-subtle"
                >
                  {grant.series.title}
                  <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      </div>
    );
  }
  const manage = canManageEvents(membership);
  const admin = isOrgAdmin(membership.role);

  const now = new Date();
  const eventWhere: Prisma.EventWhereInput = {
    organisationId: organisation.id,
    ...(view === "upcoming"
      ? { status: EventStatus.PUBLISHED, endDateTime: { gte: now } }
      : {}),
    ...(view === "past"
      ? { status: EventStatus.PUBLISHED, endDateTime: { lt: now } }
      : {}),
    ...(view === "draft" ? { status: EventStatus.DRAFT } : {}),
  };
  const [activeEvents, totalEvents, totalSeries] = await Promise.all([
    prisma.event.count({
      where: {
        organisationId: organisation.id,
        status: EventStatus.PUBLISHED,
        endDateTime: { gte: now },
      },
    }),
    prisma.event.count({ where: eventWhere }),
    prisma.eventSeries.count({ where: { organisationId: organisation.id } }),
  ]);
  const totalPages = Math.ceil(totalEvents / EVENT_PAGE_SIZE) || 1;
  const safePage = Math.min(page, totalPages);
  const totalSeriesPages = Math.ceil(totalSeries / SERIES_PAGE_SIZE) || 1;
  const safeSeriesPage = Math.min(seriesPage, totalSeriesPages);

  const [events, seriesList] = await Promise.all([
    prisma.event.findMany({
      where: eventWhere,
      orderBy:
        view === "past"
          ? { startDateTime: "desc" }
          : view === "all" || view === "draft"
            ? { createdAt: "desc" }
            : { startDateTime: "asc" },
      skip: (safePage - 1) * EVENT_PAGE_SIZE,
      take: EVENT_PAGE_SIZE,
    }),
    prisma.eventSeries.findMany({
      where: { organisationId: organisation.id },
      orderBy: { createdAt: "desc" },
      skip: (safeSeriesPage - 1) * SERIES_PAGE_SIZE,
      take: SERIES_PAGE_SIZE,
    }),
  ]);

  const base = `/dashboard/${organisation.slug}`;
  const viewLabels: Record<EventView, string> = { upcoming: "Upcoming", past: "Past", draft: "Draft", all: "All" };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Organisation workspace"
        title={organisation.name}
        description="Plan events, manage your members, and keep your organisation moving."
        actions={
          <>
            {admin ? (
              <Button asChild variant="quiet" size="sm">
                <Link href={`${base}/settings`}>
                  <Settings aria-hidden className="size-4" />
                  Settings
                </Link>
              </Button>
            ) : null}
            {manage ? (
              <>
                <CreateSeriesDialog organisationSlug={organisation.slug} canPublish={manage} />
                <CreateEventDialog organisationSlug={organisation.slug} variant="button" />
              </>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active events" value={activeEvents} />
      </div>

      <section aria-labelledby="events-title" className="flex flex-col gap-4">
        <h2 id="events-title" className="text-h3 text-ink">Events</h2>
        <NavTabs
          label="Filter events"
          items={(["upcoming", "past", "draft", "all"] as const).map((option) => ({
            href: `${base}${dashboardQuery({ view: option, seriesPage: safeSeriesPage })}`,
            label: viewLabels[option],
            active: view === option,
          }))}
        />

        {events.length === 0 ? (
          <EmptyState>
            {view === "upcoming"
              ? "No upcoming published events."
              : `No ${view} events found.`}
            {manage && view === "all" ? " Create one using New event." : ""}
          </EmptyState>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {events.map((event) => (
                <li key={event.id}>
                  <EventCard
                    orgSlug={organisation.slug}
                    compact
                    href={manage ? `${base}/event/${event.id}` : undefined}
                    event={event}
                  />
                </li>
              ))}
            </ul>

            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-sm text-ink-muted">
                Showing {(safePage - 1) * EVENT_PAGE_SIZE + 1}–
                {Math.min(safePage * EVENT_PAGE_SIZE, totalEvents)} of{" "}
                {totalEvents} event{totalEvents === 1 ? "" : "s"}
              </p>
              {totalPages > 1 ? <Chip size="sm" tone="outline">{`Page ${safePage} of ${totalPages}`}</Chip> : null}
            </div>

            {totalPages > 1 ? (
              <nav aria-label="Event pages" className="flex flex-wrap items-center justify-center gap-1.5">
                <PageLink href={`${base}${dashboardQuery({ view, page: safePage - 1, seriesPage: safeSeriesPage })}`} disabled={safePage <= 1}>
                  <ChevronLeft aria-hidden className="size-4" />
                  Previous
                </PageLink>
                {paginationWindow(safePage, totalPages).map((p) => (
                  <Link
                    key={p}
                    href={`${base}${dashboardQuery({ view, page: p, seriesPage: safeSeriesPage })}`}
                    aria-current={p === safePage ? "page" : undefined}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                      p === safePage ? "bg-primary text-on-primary" : "text-ink-secondary hover:bg-muted",
                    )}
                  >
                    {p}
                  </Link>
                ))}
                <PageLink href={`${base}${dashboardQuery({ view, page: safePage + 1, seriesPage: safeSeriesPage })}`} disabled={safePage >= totalPages}>
                  Next
                  <ChevronRight aria-hidden className="size-4" />
                </PageLink>
              </nav>
            ) : null}
          </>
        )}
      </section>

      <section id="series" aria-labelledby="series-title" className="flex scroll-mt-6 flex-col gap-4">
        <h2 id="series-title" className="text-h3 text-ink">Event series</h2>
        {seriesList.length === 0 ? (
          <EmptyState>No recurring series yet. Create one to keep a regular event rhythm.</EmptyState>
        ) : (
          <>
            <ul className="flex flex-col gap-2.5">
              {seriesList.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`${base}/series/${s.id}`}
                    className="flex items-center gap-3 rounded-lg border border-line bg-canvas p-4 transition-colors hover:bg-subtle"
                  >
                    <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-ink-secondary">
                      <Repeat className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink">{s.title}</span>
                    <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
            {totalSeriesPages > 1 ? (
              <nav aria-label="Series pages" className="flex flex-wrap items-center justify-end gap-2">
                <PageLink href={`${base}${dashboardQuery({ view, page: safePage, seriesPage: safeSeriesPage - 1 })}`} disabled={safeSeriesPage <= 1}>
                  Previous series
                </PageLink>
                <Chip size="sm" tone="outline">{`Series page ${safeSeriesPage} of ${totalSeriesPages}`}</Chip>
                <PageLink href={`${base}${dashboardQuery({ view, page: safePage, seriesPage: safeSeriesPage + 1 })}`} disabled={safeSeriesPage >= totalSeriesPages}>
                  Next series
                </PageLink>
              </nav>
            ) : null}
          </>
        )}
      </section>

      {manage ? (
        <div className="fixed bottom-6 right-6 z-10 md:hidden">
          <CreateEventDialog organisationSlug={organisation.slug} variant="fab" />
        </div>
      ) : null}
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <Button variant="secondary" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="secondary" size="sm">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
