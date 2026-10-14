import Link from "next/link";
import { QrCode } from "lucide-react";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/display";
import { NoPermission } from "./shared";

export async function CheckInPanel({ ctx }: { ctx: EventDashboardContext }) {
  const { event, permissions, organisation } = ctx;
  if (!permissions.canCheckIn) return <NoPermission>You do not have permission to operate check-in.</NoPermission>;
  return (
    <SectionHeading
      title="Check-in station"
      description="Scan attendee QR codes from their ticket page, paste ticket URLs, search by name, and export who arrived. Use override for waitlist or pending approvals at the door."
      action={
        <Button asChild variant="primary">
          <Link href={`/dashboard/${organisation.slug}/event/${event.id}/check-in`}>
            <QrCode aria-hidden className="size-[18px]" />
            Open check-in page
          </Link>
        </Button>
      }
    />
  );
}
