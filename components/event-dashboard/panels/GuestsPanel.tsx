import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadAttendees, loadEventInvites, loadRegistrationFields } from "@/lib/eventDashboard/data";
import { EventInvitePanel } from "@/components/invites/EventInvitePanel";
import { SubTabs } from "../SubTabs";
import { GuestsPeople } from "./GuestsPeople";
import { NoPermission } from "./shared";

export async function GuestsPanel({ ctx }: { ctx: EventDashboardContext }) {
  const { event, permissions, organisation } = ctx;
  const [attendees, fields, invites] = await Promise.all([
    permissions.canManageRegistrations ? loadAttendees(event.id, ctx.origin) : Promise.resolve({ attendees: [], truncated: false }),
    loadRegistrationFields(event.id),
    permissions.canManageInvitations ? loadEventInvites(event.id) : Promise.resolve([]),
  ]);
  return (
    <SubTabs
      label="Guests sections"
      items={[
        {
          value: "people",
          label: "People",
          content: permissions.canManageRegistrations ? (
            <GuestsPeople organisationSlug={organisation.slug} eventId={event.id} eventTitle={event.title} attendees={attendees.attendees} truncated={attendees.truncated} registrationFields={fields} />
          ) : (
            <NoPermission>You do not have permission to view or manage attendee registrations.</NoPermission>
          ),
        },
        {
          value: "invites",
          label: "Invites",
          count: permissions.canManageInvitations ? invites.length : undefined,
          content: <EventInvitePanel organisationSlug={organisation.slug} eventId={event.id} eventHasEnded={event.endDateTime <= ctx.now} invites={invites} />,
        },
      ]}
    />
  );
}
