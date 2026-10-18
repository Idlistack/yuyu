import { EventPermission } from "@prisma/client";
import type { EventPermissionsDto } from "@/lib/mobile/schemas";

/* Pure permission flags for the mobile organiser UI (mirrors lib/eventDashboard/context.ts). */

export function eventPermissionsFor(isAdmin: boolean, grant: readonly EventPermission[]): EventPermissionsDto {
  const has = (permission: EventPermission) => isAdmin || grant.includes(permission);
  return {
    checkIn: has(EventPermission.CHECK_IN),
    // RSVP lifecycle, emails, feedback settings and the registration window
    // are organisation OWNER/ADMIN operations on the web, so they are here too.
    manageRegistrations: isAdmin,
    sendEmails: isAdmin,
    schedule: has(EventPermission.PUBLISH_AND_SCHEDULE),
    manageFeedback: isAdmin,
    manageRegistrationWindow: isAdmin,
  };
}

/** Guests and counts are visible to registration managers and to the check-in desk (which already sees the roster). */
export function canSeeGuests(permissions: EventPermissionsDto) {
  return permissions.manageRegistrations || permissions.checkIn;
}
