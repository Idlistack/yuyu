type CalendarEvent = {
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  location?: string | null;
};

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

function formatCalendarDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Builds a portable UTC iCalendar event. Calendar clients display UTC values in the recipient's local timezone. */
export function createCalendarInvite(event: CalendarEvent & { uid: string; createdAt?: Date }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yuyu//Event Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(event.uid)}`,
    `DTSTAMP:${formatCalendarDate(event.createdAt ?? new Date())}`,
    `DTSTART:${formatCalendarDate(event.startDateTime)}`,
    `DTEND:${formatCalendarDate(event.endDateTime)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${escapeCalendarText(`Your confirmed Yuyu RSVP. Event timezone: ${event.timezone}`)}`,
    ...(event.location?.trim() ? [`LOCATION:${escapeCalendarText(event.location.trim())}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];
  return lines.join("\r\n");
}

export function calendarInviteFilename(title: string) {
  const safeTitle = title
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50) || "event";
  return `${safeTitle}.ics`;
}
