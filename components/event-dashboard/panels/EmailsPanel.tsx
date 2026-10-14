import type { RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadRsvpStatusCounts } from "@/lib/eventDashboard/data";
import { formatRelativeTime } from "@/lib/format/datetime";
import { EventBroadcastPanel } from "@/components/broadcasts/EventBroadcastPanel";
import { NoPermission } from "./shared";

export async function EmailsPanel({ ctx }: { ctx: EventDashboardContext }) {
  const { event, permissions, organisation, now } = ctx;
  if (!permissions.canManageRegistrations) return <NoPermission>You do not have permission to email attendees.</NoPermission>;
  const [records, counts] = await Promise.all([
    prisma.eventBroadcast.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, subject: true, body: true, statuses: true, attendance: true, recipientCount: true, createdAt: true, createdBy: { select: { name: true } } },
    }),
    loadRsvpStatusCounts(event.id),
  ]);
  const statusCounts: Record<RsvpStatus, number> = {
    CONFIRMED: counts.confirmed,
    WAITLISTED: counts.waitlisted,
    PENDING_APPROVAL: counts.pendingApproval,
    REJECTED: counts.rejected,
  };
  return (
    <EventBroadcastPanel
      organisationSlug={organisation.slug}
      eventId={event.id}
      statusCounts={statusCounts}
      history={records.map((row) => ({
        id: row.id,
        subject: row.subject,
        body: row.body,
        statuses: row.statuses,
        attendance: row.attendance,
        recipientCount: row.recipientCount,
        createdAt: row.createdAt.toISOString(),
        sentLabel: formatRelativeTime(row.createdAt, event.timezone, now),
        createdByName: row.createdBy?.name ?? null,
      }))}
    />
  );
}
