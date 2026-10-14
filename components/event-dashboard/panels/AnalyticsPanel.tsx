import { EventReportDownloadButton } from "@/components/reports/EventReportDownloadButton";
import { EmptyState } from "@/components/ui/display";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadRsvpStatusCounts } from "@/lib/eventDashboard/data";
import { loadAllSignupDates, loadFeedbackCount } from "@/lib/eventDashboard/overview";
import { FunnelCard, StatusMixCard, TimelineCard, type MixPart } from "../analytics/AnalyticsSections";
import { busiestDay, funnelSteps, signupTimeline, waffleCells } from "../analytics/metrics";
import { NoPermission } from "./shared";

/** Analytics tab: registration numbers are organisation-admin only, like the RSVP actions and the PDF report. */
export async function AnalyticsPanel({ ctx }: { ctx: EventDashboardContext }) {
  const { event, permissions, now } = ctx;
  if (!permissions.canManageRegistrations) return <NoPermission>You do not have permission to see registration numbers for this event.</NoPermission>;

  const [counts, feedback, signupDates] = await Promise.all([loadRsvpStatusCounts(event.id), loadFeedbackCount(event.id), loadAllSignupDates(event.id)]);
  const ended = event.endDateTime < now;
  const funnel = funnelSteps({ responded: counts.total, going: counts.confirmed, checkedIn: counts.checkedIn, feedback, ended });
  const parts: MixPart[] = [
    { key: "going", label: "Going", value: counts.confirmed, tone: "bg-success-solid" },
    { key: "waitlist", label: "Waitlist", value: counts.waitlisted, tone: "bg-warning-solid" },
    { key: "pending", label: "Waiting for approval", value: counts.pendingApproval, tone: "bg-primary" },
    { key: "declined", label: "Declined", value: counts.rejected, tone: "bg-danger-solid" },
  ];
  const until = ended ? event.endDateTime : now;
  const timeline = signupTimeline(signupDates, until);
  const busiest = busiestDay(
    signupDates.filter((date) => date <= until),
    event.timezone,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-ui text-ink-secondary">{ended ? "Final numbers for this event. Everything here is also in the PDF report." : "Live numbers for this event. The PDF report is ready once the event ends."}</p>
        {permissions.isAdmin && ended ? <EventReportDownloadButton href={`/api/reports/event/${event.id}`} label="Download report (PDF)" /> : null}
      </div>

      {counts.total === 0 ? (
        <EmptyState title="No responses yet">Numbers show up here as soon as people sign up.</EmptyState>
      ) : (
        <>
          <FunnelCard {...funnel} />
          <div className="grid gap-5 lg:grid-cols-2">
            <StatusMixCard parts={parts} cells={waffleCells(parts, 100)} />
            {timeline ? <TimelineCard timeline={timeline} busiest={busiest} timeZone={event.timezone} now={now} /> : null}
          </div>
        </>
      )}
    </div>
  );
}
