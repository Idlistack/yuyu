"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Alert, Autocomplete, Box, Button, Chip, Divider, Grid, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import { deleteScheduleTrack, deleteWebsiteContent, reorderScheduleTracks, saveScheduleTrack, saveSession, setEventSessionDelay } from "@/app/actions/event-website";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { RichTextEditor } from "@/components/editor/RichTextEditor";

export type ProgramScheduleTrack = { id: string; name: string; sortOrder: number };
export type ProgramScheduleRow = {
  id: string; trackId: string; title: string; descriptionHtml: string;
  startDateTime: string; endDateTime: string; effectiveStartDateTime: string; effectiveEndDateTime: string;
  type: string; visibility: string; sortOrder: number; speakerIds: string[]; speakerNames?: string[];
  delayMinutes: number; cumulativeDelayMinutes: number; hasConflict: boolean;
};

const types = ["Keynote", "Talk", "Panel", "Workshop", "Fireside chat", "Networking", "Break", "Other"];
const displayType = (type: string) => type.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

function localValue(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function zonedInputToIso(value: string, timeZone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const guess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const offset = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - guess;
  const iso = new Date(guess - offset).toISOString();
  return localValue(iso, timeZone) === value ? iso : null;
}
function display(iso: string, timeZone: string) { return new Date(iso).toLocaleString(undefined, { timeZone, dateStyle: "medium", timeStyle: "short" }); }

export function EventProgramScheduleManager({ organisationSlug, eventId, eventStart, timeZone, tracks, sessions, speakers }: {
  organisationSlug: string; eventId: string; eventStart: string; timeZone: string;
  tracks: ProgramScheduleTrack[]; sessions: ProgramScheduleRow[]; speakers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
  const [selectedSpeakerIds, setSelectedSpeakerIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [removeTarget, setRemoveTarget] = useState<ProgramScheduleRow | null>(null);
  const target = { organisationSlug, eventId };
  const sortedTracks = [...tracks].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const complete = (result: { ok: boolean; error?: string }, close?: () => void) => {
    if (!result.ok) setError(result.error || "Could not save the programme.");
    else { setError(""); close?.(); router.refresh(); }
  };
  const trackSessions = (trackId: string) => sessions.filter((session) => session.trackId === trackId);
  const nextSessionStart = (trackId: string) => [...trackSessions(trackId)].sort((a, b) => new Date(a.endDateTime).getTime() - new Date(b.endDateTime).getTime()).at(-1)?.endDateTime ?? eventStart;
  const saveTrack = (event: FormEvent<HTMLFormElement>, track?: ProgramScheduleTrack) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    startTransition(async () => complete(await saveScheduleTrack({ ...target, ...(track ? { id: track.id } : {}), name })));
  };
  const moveTrack = (track: ProgramScheduleTrack, direction: -1 | 1) => {
    const index = sortedTracks.findIndex((candidate) => candidate.id === track.id);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sortedTracks.length) return;
    const next = [...sortedTracks]; [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    startTransition(async () => complete(await reorderScheduleTracks({ ...target, trackIds: next.map((item) => item.id) })));
  };
  const removeTrack = (track: ProgramScheduleTrack) => startTransition(async () => complete(await deleteScheduleTrack({ ...target, trackId: track.id })));
  const removeSession = (id: string) => startTransition(async () => complete(await deleteWebsiteContent({ ...target, kind: "session", id })));
  const updateDelay = (sessionId: string, delayMinutes: number) => startTransition(async () => complete(await setEventSessionDelay({ ...target, sessionId, delayMinutes })));
  const submitSession = (event: FormEvent<HTMLFormElement>, session?: ProgramScheduleRow) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDateTime = zonedInputToIso(String(form.get("start") ?? ""), timeZone);
    const endDateTime = zonedInputToIso(String(form.get("end") ?? ""), timeZone);
    if (!startDateTime || !endDateTime) { setError("Choose a valid local time. This time does not exist in the event time zone."); return; }
    startTransition(async () => {
      const result = await saveSession({ ...target, ...(session ? { id: session.id } : {}), trackId: String(form.get("trackId") ?? ""), speakerIds: selectedSpeakerIds, title: String(form.get("title") ?? ""), descriptionHtml: String(form.get("descriptionHtml") ?? ""), startDateTime, endDateTime, type: String(form.get("type") ?? "Talk"), visibility: String(form.get("visibility") ?? "PUBLISHED"), sortOrder: Number(form.get("sortOrder") ?? 0) });
      if (result.ok && result.data?.conflictingSessions.length) setWarning(`This overlaps ${result.data.conflictingSessions.map((conflict) => conflict.title).join(", ")} in the same track.`);
      else if (result.ok) setWarning("");
      complete(result, () => { setEditing(null); setAddingTrackId(null); setSelectedSpeakerIds([]); });
    });
  };
  const sessionFields = (session: ProgramScheduleRow | undefined, defaultTrackId: string) => <Stack spacing={2.5}>
    <Box><Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Session details</Typography><Grid container spacing={1.5}><Grid size={{ xs: 12 }}><TextField name="title" label="Session title" defaultValue={session?.title ?? ""} placeholder="e.g. Building inclusive communities" required fullWidth autoFocus={!session} /></Grid><Grid size={{ xs: 12 }}><RichTextEditor name="descriptionHtml" label="Session description" defaultValue={session?.descriptionHtml ?? ""} helperText="Optional details shown on the public session page." minHeight={100} /></Grid></Grid></Box>
    <Box sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}><Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>When and where</Typography><Grid container spacing={1.5}><Grid size={{ xs: 12, sm: 6 }}><TextField name="start" label="Planned start" type="datetime-local" defaultValue={session ? localValue(session.startDateTime, timeZone) : localValue(nextSessionStart(defaultTrackId), timeZone)} slotProps={{ inputLabel: { shrink: true } }} required fullWidth /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField name="end" label="Planned end" type="datetime-local" defaultValue={session ? localValue(session.endDateTime, timeZone) : ""} slotProps={{ inputLabel: { shrink: true } }} required fullWidth /></Grid><Grid size={{ xs: 12, sm: 7 }}><TextField name="trackId" label="Track" select defaultValue={session?.trackId ?? defaultTrackId} helperText="Tracks are the room, stage, or stream shown to attendees." required fullWidth>{sortedTracks.map((track) => <MenuItem key={track.id} value={track.id}>{track.name}</MenuItem>)}</TextField></Grid><Grid size={{ xs: 12, sm: 5 }}><Autocomplete freeSolo options={types} defaultValue={displayType(session?.type ?? "Talk")} fullWidth renderInput={(params) => <TextField {...params} name="type" label="Type" required helperText="Choose or type your own." />} /></Grid></Grid></Box>
    <Box><Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Speakers and visibility</Typography><Grid container spacing={1.5}><Grid size={{ xs: 12 }}><Autocomplete multiple options={speakers} value={speakers.filter((speaker) => selectedSpeakerIds.includes(speaker.id))} onChange={(_, selected) => setSelectedSpeakerIds(selected.map((speaker) => speaker.id))} getOptionLabel={(speaker) => speaker.name} isOptionEqualToValue={(option, value) => option.id === value.id} renderInput={(params) => <TextField {...params} label="Speakers" helperText={speakers.length ? "Select everyone appearing in this session." : "Add speakers from the Event Page tab before assigning them."} />} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField name="visibility" label="Visibility" select defaultValue={session?.visibility ?? "PUBLISHED"} fullWidth><MenuItem value="PUBLISHED">Published</MenuItem><MenuItem value="DRAFT">Draft</MenuItem><MenuItem value="HIDDEN">Hidden</MenuItem></TextField></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField name="sortOrder" label="Display order" type="number" defaultValue={session?.sortOrder ?? trackSessions(defaultTrackId).length} slotProps={{ htmlInput: { min: 0 } }} helperText="Use when sessions share a start time." fullWidth /></Grid></Grid></Box>
  </Stack>;
  return <Stack spacing={2.5}>
    {error ? <Alert severity="error">{error}</Alert> : null}{warning ? <Alert severity="warning" onClose={() => setWarning("")}>{warning}</Alert> : null}
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}><Stack spacing={2}><Box><Typography variant="h5">Programme tracks</Typography><Typography variant="body2" color="text.secondary">Each track is an independent room, stage, or stream. Delays shift only later sessions in that track.</Typography></Box><Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={1} onSubmit={(event) => saveTrack(event)}><TextField name="name" label="New track" placeholder="e.g. Main Hall" required fullWidth /><Button type="submit" variant="contained" disabled={pending}>Add track</Button></Stack>{sortedTracks.length ? <Stack divider={<Divider flexItem />}>{sortedTracks.map((track, index) => <Stack key={track.id} component="form" direction={{ xs: "column", md: "row" }} spacing={1} sx={{ py: 1, alignItems: { md: "center" } }} onSubmit={(event) => saveTrack(event, track)}><TextField name="name" defaultValue={track.name} label="Track name" size="small" sx={{ minWidth: { md: 260 } }} /><Stack direction="row" spacing={0.5}><Button type="submit" size="small" disabled={pending}>Rename</Button><Button size="small" disabled={pending || index === 0} onClick={() => moveTrack(track, -1)}>Up</Button><Button size="small" disabled={pending || index === sortedTracks.length - 1} onClick={() => moveTrack(track, 1)}>Down</Button><Button size="small" color="error" disabled={pending} onClick={() => removeTrack(track)}>Remove</Button></Stack></Stack>)}</Stack> : <Alert severity="info">Add a track before adding sessions.</Alert>}</Stack></Paper>
    <Grid container spacing={2}>{sortedTracks.map((track) => { const sessionsInTrack = trackSessions(track.id); return <Grid key={track.id} size={{ xs: 12, lg: 6 }}><Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, height: "100%" }}><Stack spacing={1.5}><Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}><Box><Typography variant="h6">{track.name}</Typography><Typography variant="body2" color="text.secondary">{sessionsInTrack.length} session{sessionsInTrack.length === 1 ? "" : "s"} · delays stay in this track</Typography></Box><Button variant="contained" size="small" disabled={pending || addingTrackId !== null} onClick={() => { setSelectedSpeakerIds([]); setAddingTrackId(track.id); }}>Add session</Button></Stack>{addingTrackId === track.id ? <Stack component="form" spacing={1.5} onSubmit={(event) => submitSession(event)} sx={{ pt: 1 }}>{sessionFields(undefined, track.id)}<Stack direction="row" spacing={1}><Button type="submit" variant="contained" disabled={pending}>Add session</Button><Button disabled={pending} onClick={() => { setSelectedSpeakerIds([]); setAddingTrackId(null); }}>Cancel</Button></Stack></Stack> : null}{sessionsInTrack.length ? <Stack divider={<Divider flexItem />}>{sessionsInTrack.map((session) => <Stack key={session.id} spacing={1.25} sx={{ py: 1.25 }}>{editing === session.id ? <Stack component="form" spacing={1.5} onSubmit={(event) => submitSession(event, session)}>{sessionFields(session, session.trackId)}<Stack direction="row" spacing={1}><Button type="submit" variant="contained" disabled={pending}>Save changes</Button><Button disabled={pending} onClick={() => { setSelectedSpeakerIds([]); setEditing(null); }}>Cancel</Button></Stack></Stack> : <><Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}><Stack spacing={0.25}><Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}><Typography sx={{ fontWeight: 700 }}>{session.title}</Typography>{session.hasConflict ? <Chip size="small" color="warning" label="Time overlap" /> : null}</Stack><Typography variant="body2" color="text.secondary">Planned: {display(session.startDateTime, timeZone)} – {display(session.endDateTime, timeZone)}</Typography><Typography variant="body2" color={session.cumulativeDelayMinutes ? "warning.main" : "text.secondary"}>Live: {display(session.effectiveStartDateTime, timeZone)} – {display(session.effectiveEndDateTime, timeZone)}{session.cumulativeDelayMinutes ? ` (${session.cumulativeDelayMinutes} min behind)` : ""}</Typography>{session.speakerNames?.length ? <Typography variant="body2" color="text.secondary">Speakers: {session.speakerNames.join(", ")}</Typography> : null}</Stack><Stack direction="row" spacing={0.5}><Button size="small" onClick={() => { setSelectedSpeakerIds(session.speakerIds); setEditing(session.id); }}>Edit</Button><Button color="error" size="small" disabled={pending} onClick={() => setRemoveTarget(session)}>Remove</Button></Stack></Stack><Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}><TextField label="Delay from this session (min)" type="number" defaultValue={session.delayMinutes} size="small" sx={{ width: { xs: "100%", sm: 260 }, flexShrink: 0 }} slotProps={{ htmlInput: { min: 0, max: 1440 } }} disabled={pending} onBlur={(event) => { const delay = Number(event.target.value); if (Number.isInteger(delay) && delay !== session.delayMinutes) updateDelay(session.id, delay); }} />{session.hasConflict ? <Typography variant="caption" color="warning.main">This overlaps another session in {track.name}; it is allowed, but attendees may need guidance.</Typography> : <Typography variant="caption" color="text.secondary">Affects only later sessions in {track.name}.</Typography>}</Stack></>}</Stack>)}</Stack> : <Typography variant="body2" color="text.secondary">No sessions in this track yet.</Typography>}</Stack></Paper></Grid>; })}</Grid>
    <ConfirmationDialog open={Boolean(removeTarget)} title="Remove programme session?" message={`Remove “${removeTarget?.title ?? "this session"}” from the event schedule? This cannot be undone.`} confirmLabel="Remove session" loading={pending} onCancel={() => setRemoveTarget(null)} onConfirm={() => { if (!removeTarget) return; const id = removeTarget.id; setRemoveTarget(null); removeSession(id); }} />
  </Stack>;
}
