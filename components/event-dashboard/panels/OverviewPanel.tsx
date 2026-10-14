import { toEventClientDto } from "@/lib/eventDto";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadAttendees, loadEventInvites, loadRsvpStatusCounts } from "@/lib/eventDashboard/data";
import { OverviewClient } from "./OverviewClient";

export async function OverviewPanel({ ctx }: { ctx: EventDashboardContext }) {
  const { event, permissions, organisation } = ctx;
  const empty = { total: 0, confirmed: 0, waitlisted: 0, pendingApproval: 0, rejected: 0, checkedIn: 0 };
  const [analytics, invites, attendees] = await Promise.all([
    permissions.canManageRegistrations ? loadRsvpStatusCounts(event.id) : Promise.resolve(empty),
    permissions.canManageInvitations ? loadEventInvites(event.id) : Promise.resolve([]),
    permissions.canManageRegistrations ? loadAttendees(event.id, ctx.origin) : Promise.resolve({ attendees: [], truncated: false }),
  ]);
  return (
    <OverviewClient
      organisationSlug={organisation.slug}
      event={toEventClientDto(event)}
      analytics={analytics}
      invites={invites}
      recentRegistrations={attendees.attendees.slice(0, 5)}
      referenceTime={ctx.now.toISOString()}
    />
  );
}
