import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { toEventClientDto } from "@/lib/eventDto";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadRegistrationFields } from "@/lib/eventDashboard/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { EditEventForm } from "@/components/event/EditEventForm";
import { EventWebsiteManager } from "@/components/event/EventWebsiteManager";
import { EventRegistrationFormEditor } from "@/components/registration/EventRegistrationFormEditor";
import { SubTabs } from "../SubTabs";
import { NoPermission } from "./shared";

export async function EventPagePanel({ ctx }: { ctx: EventDashboardContext }) {
  const { event, permissions, organisation } = ctx;
  const fields = await loadRegistrationFields(event.id);
  const website = {
    page: event.page,
    highlights: event.highlights.map((x) => ({ id: x.id, title: x.title, description: x.description, visibility: x.visibility, values: { icon: x.icon, sortOrder: x.sortOrder } })),
    speakers: event.speakers.map((x) => ({ id: x.id, title: x.name, description: x.bioHtml, visibility: x.visibility, values: { headline: x.headline, organisation: x.organisation, photoUrl: x.photoUrl, websiteUrl: x.websiteUrl, linkedinUrl: x.linkedinUrl, xUrl: x.xUrl, sortOrder: x.sortOrder } })),
    sponsors: event.sponsors.map((x) => ({ id: x.id, title: x.name, description: x.description, visibility: x.visibility, values: { logoUrl: x.logoUrl, websiteUrl: x.websiteUrl, tier: x.tier, sortOrder: x.sortOrder } })),
    resources: event.resources.map((x) => ({ id: x.id, title: x.title, description: x.description, visibility: x.visibility, values: { externalUrl: x.externalUrl, sortOrder: x.sortOrder } })),
    faqs: event.faqs.map((x) => ({ id: x.id, title: x.question, description: x.answerHtml, visibility: x.visibility, values: { sortOrder: x.sortOrder } })),
  };
  const dto = toEventClientDto(event);
  return (
    <SubTabs
      label="Event page sections"
      items={[
        {
          value: "details",
          label: "Details",
          content: permissions.canEditDetails ? <EditEventForm organisationSlug={organisation.slug} event={dto} page={website.page} /> : <NoPermission>You do not have permission to edit event details.</NoPermission>,
        },
        {
          value: "page",
          label: "Page & programme",
          content: (
            <div className="flex flex-col gap-6">
              {permissions.canManageSchedule ? (
                <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-title text-ink">Programme schedule</h2>
                    <p className="mt-1 text-body-ui text-ink-muted">Add sessions, adjust planned times, and apply live cascading delays from the dedicated schedule workspace.</p>
                  </div>
                  <Button asChild variant="secondary" className="shrink-0">
                    <Link href={`/dashboard/${organisation.slug}/event/${event.id}/schedule`}>
                      Open schedule
                      <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  </Button>
                </Card>
              ) : (
                <NoPermission>You do not have permission to manage the programme.</NoPermission>
              )}
              {permissions.canEditDetails ? <EventWebsiteManager organisationSlug={organisation.slug} eventId={event.id} eventSlug={event.slug} {...website} /> : <NoPermission>You do not have permission to edit the event page.</NoPermission>}
            </div>
          ),
        },
        {
          value: "registration",
          label: "Registration form",
          content: <EventRegistrationFormEditor organisationSlug={organisation.slug} eventId={event.id} fields={fields} />,
        },
      ]}
    />
  );
}
