import { Grid, Paper, Stack, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import { ContentVisibility } from "@prisma/client";
import { prisma } from "@/lib/db";
import { effectiveEventProgram } from "@/lib/eventProgram";
import { resolvePublicEventAccess } from "@/lib/publicEventAccess";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Event programme" };

export default async function EventSchedulePage({ params }: { params: Promise<{ orgSlug: string; eventSlug: string }> }) {
  const { orgSlug, eventSlug } = await params;
  const org = await prisma.organisation.findUnique({ where: { slug: orgSlug } });
  if (!org) notFound();
  const event = await prisma.event.findUnique({ where: { organisationId_slug: { organisationId: org.id, slug: eventSlug } }, include: { page: { select: { isPublished: true } }, scheduleTracks: { orderBy: { sortOrder: "asc" }, include: { sessions: { where: { visibility: ContentVisibility.PUBLISHED }, orderBy: [{ startDateTime: "asc" }, { sortOrder: "asc" }] } } } } });
  if (!event) notFound();
  const access = await resolvePublicEventAccess({ organisationId: org.id, eventId: event.id, status: event.status, privacyType: event.privacyType, websiteReleased: event.page?.isPublished ?? false });
  if (!access.allowed) notFound();
  const tracks = event.scheduleTracks.map((track) => ({ ...track, sessions: effectiveEventProgram(track.sessions) })).filter((track) => track.sessions.length > 0);
  return <Stack spacing={2} sx={{ maxWidth: 1200, py: 2 }}><Typography variant="overline">{org.name}</Typography><Typography variant="h3">{event.title} program</Typography><Grid container spacing={2}>{tracks.map((track) => <Grid key={track.id} size={{ xs: 12, md: 6 }}><Paper variant="outlined" sx={{ p: 2, height: "100%" }}><Typography variant="h6" sx={{ mb: 1 }}>{track.name}</Typography><Stack spacing={1}>{track.sessions.map((session) => <Stack key={session.id} component="a" href={`/${org.slug}/${event.slug}/sessions/${session.slug}`} sx={{ p: 1.5, color: "text.primary", textDecoration: "none", border: 1, borderColor: "divider", borderRadius: 2 }}><Typography sx={{ fontWeight: 700 }}>{session.title}</Typography><Typography variant="body2">{session.effectiveStartDateTime.toLocaleString(undefined, { timeZone: event.timezone })} · {session.type}</Typography></Stack>)}</Stack></Paper></Grid>)}</Grid></Stack>;
}
