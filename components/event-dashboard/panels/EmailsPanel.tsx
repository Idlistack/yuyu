import { prisma } from "@/lib/db";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { EventBroadcastPanel } from "@/components/broadcasts/EventBroadcastPanel";
import { NoPermission } from "./shared";

export async function EmailsPanel({ ctx }: { ctx: EventDashboardContext }) {
  const { event, permissions, organisation } = ctx;
  if (!permissions.canManageRegistrations) return <NoPermission>You do not have permission to email attendees.</NoPermission>;
  const records = await prisma.eventBroadcast.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, subject: true, body: true, statuses: true, attendance: true, recipientCount: true, createdAt: true, createdBy: { select: { name: true } } },
  });
  return (
    <EventBroadcastPanel
      organisationSlug={organisation.slug}
      eventId={event.id}
      history={records.map((row) => ({
        id: row.id,
        subject: row.subject,
        body: row.body,
        statuses: row.statuses,
        attendance: row.attendance,
        recipientCount: row.recipientCount,
        createdAt: row.createdAt.toISOString(),
        createdByName: row.createdBy?.name ?? null,
      }))}
    />
  );
}
