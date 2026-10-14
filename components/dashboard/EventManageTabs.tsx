"use client";

import { useState } from "react";
import Link from "next/link";
import type { EventPermission } from "@prisma/client";
import type { EventClientDto } from "@/lib/eventDto";
import { ArrowRight, Download, QrCode, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, Card, SectionHeading } from "@/components/ui/display";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditEventForm } from "@/components/event/EditEventForm";
import { AttendeeTable, type AttendeeRow } from "@/components/attendees/AttendeeTable";
import { EventInvitePanel } from "@/components/invites/EventInvitePanel";
import { EventManageOverview } from "@/components/dashboard/EventManageOverview";
import { EventAnalyticsPanel } from "@/components/dashboard/EventAnalyticsPanel";
import { EventManageMore } from "@/components/dashboard/EventManageMore";
import { FeedbackFormEditor } from "@/components/feedback/FeedbackFormEditor";
import { FeedbackResponsesPanel, type FeedbackResponseRow } from "@/components/feedback/FeedbackResponsesPanel";
import {
  EventRegistrationFormEditor,
  type RegistrationFieldRow,
} from "@/components/registration/EventRegistrationFormEditor";
import { ManualRsvpDialog } from "@/components/attendees/ManualRsvpDialog";
import { useRouter } from "next/navigation";
import { CollaboratorInvitePanel } from "@/components/event/CollaboratorInvitePanel";
import { EventWebsiteManager } from "@/components/event/EventWebsiteManager";
import { EventBroadcastPanel, type BroadcastHistoryRow } from "@/components/broadcasts/EventBroadcastPanel";

type InviteRow = { id: string; email: string; createdAt: string };

const EVENT_TABS = [
  { value: "overview", label: "Overview" },
  { value: "guests", label: "Guests" },
  { value: "page", label: "Page & programme" },
  { value: "details", label: "Details" },
  { value: "registration", label: "Registration form" },
  { value: "invites", label: "Invites" },
  { value: "emails", label: "Emails" },
  { value: "analytics", label: "Analytics" },
  { value: "check-in", label: "Check-in" },
  { value: "feedback", label: "Feedback" },
  { value: "settings", label: "Settings" },
] as const;
type EventTab = (typeof EVENT_TABS)[number]["value"];

function NoPermission({ children }: { children: React.ReactNode }) {
  return <p className="text-body-ui text-ink-muted">{children}</p>;
}

export function EventManageTabs(props: {
  organisationSlug: string;
  event: EventClientDto;
  attendees: AttendeeRow[];
  attendeesTruncated: boolean;
  invites: InviteRow[];
  registrationFields: RegistrationFieldRow[];
  feedbackUrl: string;
  feedbackForm: { isOpen: boolean; title: string; thankYouMessage: string; certificateEnabled: boolean; certificateTemplate?: unknown } | null;
  feedbackFields: RegistrationFieldRow[];
  feedbackResponses: FeedbackResponseRow[];
  feedbackResponsesTruncated: boolean;
  referenceTime: string;
  analytics: {
    total: number;
    confirmed: number;
    waitlisted: number;
    pendingApproval: number;
    rejected: number;
    checkedIn: number;
  };
  website: { page: { isPublished: boolean; tagline: string; logoUrl: string | null; accentColor: string | null; aboutHtml: string; sections: Array<{ type: string; isVisible: boolean; sortOrder: number }> } | null; highlights: Array<{ id: string; title: string; description: string; visibility: string; values: Record<string, string | number | null> }>; speakers: Array<{ id: string; title: string; description: string; visibility: string; values: Record<string, string | number | null> }>; sponsors: Array<{ id: string; title: string; description: string; visibility: string; values: Record<string, string | number | null> }>; resources: Array<{ id: string; title: string; description: string; visibility: string; values: Record<string, string | number | null> }>; faqs: Array<{ id: string; title: string; description: string; visibility: string; values: Record<string, string | number | null> }> };
  canManageCollaborators: boolean;
  collaborators: Array<{ id: string; name: string | null; email: string | null; permissions: EventPermission[] }>;
  pendingCollaboratorInvites: Array<{ id: string; email: string; expiresAt: string }>;
  canManageRegistrations: boolean;
  canCheckIn: boolean;
  canEditDetails: boolean;
  canManageSchedule: boolean;
  broadcasts: BroadcastHistoryRow[];
}) {
  const { organisationSlug, event, attendees, attendeesTruncated, invites, analytics, registrationFields, feedbackUrl, feedbackForm, feedbackFields, feedbackResponses, feedbackResponsesTruncated, referenceTime, website, canManageCollaborators, canManageRegistrations, canCheckIn, canEditDetails, canManageSchedule, collaborators, pendingCollaboratorInvites, broadcasts } = props;
  const [tab, setTab] = useState<EventTab>("overview");
  const [manualRsvpOpen, setManualRsvpOpen] = useState(false);
  const router = useRouter();

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as EventTab)}>
      <TabsList aria-label="Manage event">
        {EVENT_TABS.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview">
        <EventManageOverview
          organisationSlug={organisationSlug}
          event={event}
          analytics={analytics}
          invites={invites}
          recentRegistrations={attendees.slice(0, 5)}
          referenceTime={referenceTime}
          onOpenTab={setTab}
        />
      </TabsContent>

      <TabsContent value="page" className="flex flex-col gap-6">
        <SectionHeading title="Page & programme" />
        {canManageSchedule ? (
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-title text-ink">Programme schedule</h2>
              <p className="mt-1 text-body-ui text-ink-muted">Add sessions, adjust planned times, and apply live cascading delays from the dedicated schedule workspace.</p>
            </div>
            <Button asChild variant="secondary" className="shrink-0">
              <Link href={`/dashboard/${organisationSlug}/event/${event.id}/schedule`}>
                Open schedule
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </Card>
        ) : <NoPermission>You do not have permission to manage the programme.</NoPermission>}
        {canEditDetails ? <EventWebsiteManager organisationSlug={organisationSlug} eventId={event.id} eventSlug={event.slug} {...website} /> : <NoPermission>You do not have permission to edit the event page.</NoPermission>}
      </TabsContent>

      <TabsContent value="details" className="flex flex-col gap-6">
        <SectionHeading title="Details" />
        {canEditDetails ? <EditEventForm organisationSlug={organisationSlug} event={event} page={website.page} /> : <NoPermission>You do not have permission to edit event details.</NoPermission>}
      </TabsContent>

      <TabsContent value="guests" className="flex flex-col gap-4">
        {!canManageRegistrations ? <NoPermission>You do not have permission to view or manage attendee registrations.</NoPermission> : null}
        {canManageRegistrations ? <>
          {attendeesTruncated ? <Callout tone="warning">Only the 250 most recent registrations are loaded in this browser view, and its email export is limited to those records. Download the full attendee CSV for the complete list.</Callout> : null}
          <SectionHeading
            title="Guests"
            action={
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary">
                  <a href={`/api/exports/events/${event.id}/attendees`}>
                    <Download aria-hidden className="size-[18px]" />
                    Download full CSV
                  </a>
                </Button>
                <Button variant="primary" startIcon={<UserPlus />} onClick={() => setManualRsvpOpen(true)}>
                  Add attendee
                </Button>
              </div>
            }
          />
          {manualRsvpOpen ? (
            <ManualRsvpDialog
              organisationSlug={organisationSlug}
              eventId={event.id}
              fields={registrationFields}
              onClose={() => setManualRsvpOpen(false)}
              onAdded={() => router.refresh()}
            />
          ) : null}
          <AttendeeTable
            organisationSlug={organisationSlug}
            eventId={event.id}
            attendees={attendees}
            canManage
            registrationFields={registrationFields}
            eventTitle={event.title}
          />
        </> : null}
      </TabsContent>

      <TabsContent value="analytics">
        <EventAnalyticsPanel analytics={analytics} />
      </TabsContent>

      <TabsContent value="invites">
        <EventInvitePanel
          organisationSlug={organisationSlug}
          eventId={event.id}
          eventHasEnded={event.endDateTime <= new Date()}
          invites={invites}
        />
      </TabsContent>

      <TabsContent value="emails" className="flex flex-col gap-6">
        <SectionHeading title="Emails" />
        {canManageRegistrations ? (
          <EventBroadcastPanel organisationSlug={organisationSlug} eventId={event.id} history={broadcasts} />
        ) : <NoPermission>You do not have permission to email attendees.</NoPermission>}
      </TabsContent>

      <TabsContent value="registration">
        <EventRegistrationFormEditor
          organisationSlug={organisationSlug}
          eventId={event.id}
          fields={registrationFields}
        />
      </TabsContent>

      <TabsContent value="feedback" className="flex flex-col gap-6">
        <FeedbackFormEditor organisationSlug={organisationSlug} eventId={event.id} feedbackUrl={feedbackUrl} form={feedbackForm} fields={feedbackFields} />
        {canEditDetails ? <FeedbackResponsesPanel responses={feedbackResponses} truncated={feedbackResponsesTruncated} exportHref={feedbackForm ? `/api/exports/events/${event.id}/feedback` : undefined} /> : <NoPermission>You do not have permission to view feedback responses.</NoPermission>}
      </TabsContent>

      <TabsContent value="check-in">
        {!canCheckIn ? <NoPermission>You do not have permission to operate check-in.</NoPermission> : (
          <SectionHeading
            title="Check-in station"
            description="Scan attendee QR codes from their ticket page, paste ticket URLs, search by name, and export who arrived. Use override for waitlist or pending approvals at the door."
            action={
              <Button asChild variant="primary">
                <Link href={`/dashboard/${organisationSlug}/event/${event.id}/check-in`}>
                  <QrCode aria-hidden className="size-[18px]" />
                  Open check-in page
                </Link>
              </Button>
            }
          />
        )}
      </TabsContent>

      <TabsContent value="settings" className="flex flex-col gap-5">
        <SectionHeading title="Settings" />
        {canManageCollaborators ? <CollaboratorInvitePanel organisationSlug={organisationSlug} eventId={event.id} collaborators={collaborators} pendingInvites={pendingCollaboratorInvites} /> : null}
        <EventManageMore organisationSlug={organisationSlug} event={event} />
      </TabsContent>
    </Tabs>
  );
}
