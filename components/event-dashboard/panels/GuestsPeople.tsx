"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, SectionHeading } from "@/components/ui/display";
import { AttendeeTable, type AttendeeRow } from "@/components/attendees/AttendeeTable";
import { ManualRsvpDialog } from "@/components/attendees/ManualRsvpDialog";
import type { RegistrationFieldRow } from "@/components/registration/EventRegistrationFormEditor";

export function GuestsPeople({ organisationSlug, eventId, eventTitle, attendees, truncated, registrationFields }: { organisationSlug: string; eventId: string; eventTitle: string; attendees: AttendeeRow[]; truncated: boolean; registrationFields: RegistrationFieldRow[] }) {
  const [manualRsvpOpen, setManualRsvpOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      {truncated ? <Callout tone="warning">Only the 250 most recent registrations are loaded in this browser view, and its email export is limited to those records. Download the full attendee CSV for the complete list.</Callout> : null}
      <SectionHeading
        title="Guests"
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <a href={`/api/exports/events/${eventId}/attendees`}>
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
      {manualRsvpOpen ? <ManualRsvpDialog organisationSlug={organisationSlug} eventId={eventId} fields={registrationFields} onClose={() => setManualRsvpOpen(false)} onAdded={() => router.refresh()} /> : null}
      <AttendeeTable organisationSlug={organisationSlug} eventId={eventId} attendees={attendees} canManage registrationFields={registrationFields} eventTitle={eventTitle} />
    </div>
  );
}
