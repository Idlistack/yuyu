import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadRsvpStatusCounts } from "@/lib/eventDashboard/data";
import { EventAnalyticsPanel } from "@/components/dashboard/EventAnalyticsPanel";

export async function AnalyticsPanel({ ctx }: { ctx: EventDashboardContext }) {
  const empty = { total: 0, confirmed: 0, waitlisted: 0, pendingApproval: 0, rejected: 0, checkedIn: 0 };
  const analytics = ctx.permissions.canManageRegistrations ? await loadRsvpStatusCounts(ctx.event.id) : empty;
  return <EventAnalyticsPanel analytics={analytics} />;
}
