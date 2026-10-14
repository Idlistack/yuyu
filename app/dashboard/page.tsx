import Link from "next/link";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Avatar, Card, OrgLogo, PageHeader, StatTile } from "@/components/ui/display";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your organisations, events, and RSVPs.",
};

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  // 1. Fetch Organisations the user belongs to
  const orgs = await prisma.organisation.findMany({
    where: {
      memberships: { some: { userId: session.user.id } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
    },
  });

  // 2. Fetch Metrics across all user's organisations
  const totalEventsCount = await prisma.event.count({
    where: {
      organisation: { memberships: { some: { userId: session.user.id } } },
      status: "PUBLISHED",
    },
  });

  // 3. Fetch 5 most recent RSVPs for activity stream
  const recentRsvps = await prisma.rSVP.findMany({
    where: {
      OR: [
        { event: { organisation: { memberships: { some: { userId: session.user.id } } } } },
        { eventInstance: { series: { organisation: { memberships: { some: { userId: session.user.id } } } } } },
      ],
    },
    include: {
      event: {
        select: {
          title: true,
          organisation: { select: { name: true, slug: true } },
        },
      },
      eventInstance: {
        select: {
          series: {
            select: {
              title: true,
              organisation: { select: { name: true, slug: true } },
            },
          },
        },
      },
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const collaboratorGrants = await prisma.eventCollaborator.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      event: { select: { id: true, title: true, organisation: { select: { id: true, name: true, slug: true } } } },
      series: { select: { id: true, title: true, organisation: { select: { id: true, name: true, slug: true } } } },
    },
  });
  const membershipOrganisationIds = new Set(orgs.map((org) => org.id));
  const coOrganizedEvents = collaboratorGrants.flatMap((grant) => {
    const item = grant.event
      ? { id: grant.event.id, title: grant.event.title, organisation: grant.event.organisation, href: `/dashboard/${grant.event.organisation.slug}/event/${grant.event.id}`, label: "Event" }
      : grant.series
        ? { id: grant.series.id, title: grant.series.title, organisation: grant.series.organisation, href: `/dashboard/${grant.series.organisation.slug}/series/${grant.series.id}`, label: "Series" }
        : null;
    return item && !membershipOrganisationIds.has(item.organisation.id) ? [{ ...item, permissions: grant.permissions }] : [];
  });

  const userName = session.user.name || "User";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        kicker="Workspace overview"
        title="Dashboard"
        description={`Welcome back, ${userName}. Everything you need to run your events, in one place.`}
        actions={
          <Button asChild variant="primary">
            <Link href="/dashboard/org/new">
              <Plus aria-hidden className="size-[18px]" />
              New Organisation
            </Link>
          </Button>
        }
      />

      {coOrganizedEvents.length ? (
        <section aria-labelledby="co-organized-title" className="flex flex-col gap-3">
          <div>
            <h2 id="co-organized-title" className="text-h3 text-ink">Co-organized events</h2>
            <p className="mt-1 text-body-ui text-ink-muted">Events you can manage without organisation membership</p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {coOrganizedEvents.map((item) => (
              <li key={`${item.label}-${item.id}`}>
                <Link href={item.href} className="flex h-full flex-col gap-1 rounded-lg border border-line bg-canvas p-5 transition-colors hover:bg-subtle">
                  <span className="text-caption text-ink-muted">{item.label} · {item.organisation.name}</span>
                  <span className="text-[17px] font-bold text-ink">{item.title}</span>
                  <span className="text-caption text-ink-muted">{item.permissions.map((permission) => permission.replaceAll("_", " ").toLowerCase()).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="orgs-title" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 id="orgs-title" className="text-h3 text-ink">Organisations</h2>
            <p className="text-body-ui text-ink-muted">Your workspaces</p>
          </div>

          {orgs.length === 0 ? (
            <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
              <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-muted text-ink-muted">
                <Building2 className="size-7" />
              </span>
              <p className="text-label text-ink">No organisations yet</p>
              <p className="max-w-[360px] text-body-ui text-ink-muted">
                Create your first organisation workspace to manage events and check-ins.
              </p>
              <Button asChild variant="primary" className="mt-1">
                <Link href="/dashboard/org/new">
                  <Plus aria-hidden className="size-[18px]" />
                  Create Organisation
                </Link>
              </Button>
            </Card>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/dashboard/${org.slug}`}
                    className="group flex h-full flex-col gap-4 rounded-xl border border-line bg-canvas p-5 transition-colors hover:bg-subtle"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <OrgLogo name={org.name} src={org.logoUrl} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-bold text-ink">{org.name}</p>
                        <p className="truncate text-sm text-ink-muted">/{org.slug}</p>
                      </div>
                    </div>
                    {org.description ? <p className="line-clamp-2 text-sm text-ink-secondary">{org.description}</p> : null}
                    <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink-secondary group-hover:text-ink">
                      Open workspace
                      <ArrowRight aria-hidden className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <StatTile label="Active Events" value={totalEventsCount} hint="Published across your workspaces" />

          <section aria-labelledby="activity-title" className="flex flex-col gap-3">
            <h2 id="activity-title" className="text-h3 text-ink">Activity</h2>
            {recentRsvps.length === 0 ? (
              <p className="text-body-ui text-ink-muted">No recent registrations.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {recentRsvps.map((rsvp) => {
                  const eventTitle = rsvp.event?.title ?? rsvp.eventInstance?.series?.title ?? "Event";
                  const orgName = rsvp.event?.organisation?.name ?? rsvp.eventInstance?.series?.organisation?.name ?? "";
                  const attendeeName = rsvp.user?.name ?? rsvp.guestName ?? "Guest";
                  const isConfirmed = rsvp.status === "CONFIRMED";

                  return (
                    <li key={rsvp.id} className="flex items-start gap-3">
                      <Avatar name={attendeeName} size="sm" tone={isConfirmed ? "success" : "warning"} />
                      <div className="min-w-0 text-sm">
                        <p className="text-ink-secondary">
                          <strong className="font-semibold text-ink">{attendeeName}</strong>{" "}
                          {isConfirmed ? "Registered for" : "Waitlisted for"}{" "}
                          <span className="text-ink">{eventTitle}</span> ({orgName})
                        </p>
                        <p className="text-caption text-ink-muted">{getTimeAgo(rsvp.createdAt)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
