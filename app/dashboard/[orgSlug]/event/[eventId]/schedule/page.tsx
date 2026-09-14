import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { EventProgramScheduleManager } from "@/components/event/EventProgramScheduleManager";
import { prisma } from "@/lib/db";
import { canAccessEvent, canViewEventDashboard } from "@/lib/eventAccess";
import { EventPermission } from "@prisma/client";
import { effectiveEventProgram } from "@/lib/eventProgram";
import { conflictingTrackSessionIds } from "@/lib/eventProgram";
import { requireOrgDashboardAccess } from "@/lib/permissions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Manage event schedule", robots: { index: false, follow: false } };

export default async function EventScheduleManagePage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const access = await requireOrgDashboardAccess(orgSlug);
  const event = await prisma.event.findFirst({ where: { id: eventId, organisationId: access.organisation.id }, include: { scheduleTracks: { orderBy: { sortOrder: "asc" } }, sessions: { include: { speakers: { include: { speaker: { select: { id: true, name: true } } } } }, orderBy: [{ startDateTime: "asc" }, { sortOrder: "asc" }] }, speakers: { select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } });
  if (!event) notFound();
  if (!access.membership && !(await canViewEventDashboard({ userId: access.userId, organisationId: access.organisation.id, eventId: event.id }))) notFound();
  if (!(await canAccessEvent({ userId: access.userId, organisationId: access.organisation.id, eventId: event.id, permission: EventPermission.PUBLISH_AND_SCHEDULE }))) notFound();
  const conflictIds = conflictingTrackSessionIds(event.sessions);
  const sessions = effectiveEventProgram(event.sessions).map((session) => ({ id: session.id, trackId: session.trackId, title: session.title, descriptionHtml: session.descriptionHtml, startDateTime: session.startDateTime.toISOString(), endDateTime: session.endDateTime.toISOString(), effectiveStartDateTime: session.effectiveStartDateTime.toISOString(), effectiveEndDateTime: session.effectiveEndDateTime.toISOString(), type: session.type, visibility: session.visibility, sortOrder: session.sortOrder, delayMinutes: session.delayMinutes, cumulativeDelayMinutes: session.cumulativeDelayMinutes, speakerIds: session.speakers.map((speaker) => speaker.speakerId), speakerNames: session.speakers.map((speaker) => speaker.speaker.name), hasConflict: conflictIds.has(session.id) }));
  return <Stack spacing={3}><Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}><div><Typography variant="h4" component="h1">{event.title} schedule</Typography><Typography color="text.secondary">Plan parallel tracks and manage live timing changes independently.</Typography></div><Button href={`/dashboard/${access.organisation.slug}/event/${event.id}`} startIcon={<ArrowBackIcon />}>Back to event</Button></Stack><EventProgramScheduleManager organisationSlug={access.organisation.slug} eventId={event.id} eventStart={event.startDateTime.toISOString()} timeZone={event.timezone} tracks={event.scheduleTracks} sessions={sessions} speakers={event.speakers} /></Stack>;
}
