"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BroadcastAttendanceFilter, RsvpStatus } from "@prisma/client";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import InputLabel from "@mui/material/InputLabel";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import PhoneIphoneOutlinedIcon from "@mui/icons-material/PhoneIphoneOutlined";
import { countBroadcastRecipients, previewEventBroadcast, sendEventBroadcast, sendEventBroadcastTest } from "@/app/actions/broadcasts";
import {
  BROADCAST_ATTENDANCE_OPTIONS,
  BROADCAST_PLACEHOLDERS,
  BROADCAST_STARTER_TEMPLATES,
  BROADCAST_STATUS_OPTIONS,
  BROADCAST_SUBJECT_MAX,
  broadcastHtmlToText,
  defaultBroadcastTemplate,
  describeBroadcastAudience,
} from "@/lib/broadcastTemplate";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { BroadcastEmailEditor } from "./BroadcastEmailEditor";

export type BroadcastHistoryRow = {
  id: string;
  subject: string;
  body: string;
  statuses: RsvpStatus[];
  attendance: BroadcastAttendanceFilter;
  recipientCount: number;
  createdAt: string;
  createdByName: string | null;
};

const TEMPLATE_GROUPS = Array.from(new Set(BROADCAST_STARTER_TEMPLATES.map((template) => template.group)));

const SUBJECT_PLACEHOLDERS = BROADCAST_PLACEHOLDERS.filter((placeholder) => ["{{name}}", "{{event}}", "{{eventDate}}", "{{organisation}}"].includes(placeholder.token));

export function EventBroadcastPanel(props: {
  organisationSlug: string;
  eventId: string;
  history: BroadcastHistoryRow[];
}) {
  const { organisationSlug, eventId, history } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const initial = useMemo(() => defaultBroadcastTemplate(), []);

  const [templateId, setTemplateId] = useState<string>(BROADCAST_STARTER_TEMPLATES[0]!.id);
  const [statuses, setStatuses] = useState<RsvpStatus[]>([...BROADCAST_STARTER_TEMPLATES[0]!.audience.statuses]);
  const [attendance, setAttendance] = useState<BroadcastAttendanceFilter>(BROADCAST_STARTER_TEMPLATES[0]!.audience.attendance);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [countState, setCountState] = useState<{ key: string; count: number; error: string | null }>({ key: "", count: 0, error: null });
  const [preview, setPreview] = useState<{ key: string; subject: string; html: string; error: string | null }>({ key: "", subject: "", html: "", error: null });
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const subjectRef = useRef<HTMLInputElement | null>(null);

  const audienceText = describeBroadcastAudience(statuses, attendance);
  const audienceKey = `${[...statuses].sort().join(",")}|${attendance}`;
  const countReady = statuses.length === 0 || countState.key === audienceKey;
  const recipientCount: number | null = statuses.length === 0 ? 0 : countReady ? countState.count : null;
  const countError = countReady ? countState.error : null;

  const previewKey = `${subject}\u0000${body}`;
  const previewReady = preview.key === previewKey;
  const hasContent = subject.trim().length > 0 && broadcastHtmlToText(body).trim().length > 0;

  // Recount on the server whenever the audience changes. The count is also
  // recomputed inside the send transaction, so this is guidance, not the truth.
  useEffect(() => {
    if (statuses.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await countBroadcastRecipients({ organisationSlug, eventId, statuses, attendance });
      if (cancelled) return;
      setCountState(result.ok
        ? { key: audienceKey, count: result.data?.count ?? 0, error: null }
        : { key: audienceKey, count: 0, error: result.error });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organisationSlug, eventId, statuses, attendance, audienceKey]);

  // The preview is rendered by the server with the real email template, so
  // what the organiser sees is exactly what a recipient receives.
  useEffect(() => {
    if (!hasContent) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewEventBroadcast({ organisationSlug, eventId, subject, body });
      if (cancelled) return;
      setPreview(result.ok
        ? { key: previewKey, subject: result.data?.subject ?? "", html: result.data?.html ?? "", error: null }
        : { key: previewKey, subject: "", html: "", error: result.error });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organisationSlug, eventId, subject, body, hasContent, previewKey]);

  function toggleStatus(value: RsvpStatus) {
    setStatuses((current) => (current.includes(value) ? current.filter((status) => status !== value) : [...current, value]));
  }

  function applyTemplate(id: string) {
    const template = BROADCAST_STARTER_TEMPLATES.find((candidate) => candidate.id === id);
    if (!template) return;
    setTemplateId(id);
    setSubject(template.subject);
    setBody(template.bodyHtml);
    setStatuses([...template.audience.statuses]);
    setAttendance(template.audience.attendance);
    showToast(`Loaded the “${template.name}” template. Edit anything before sending.`, "success");
  }

  function insertSubjectPlaceholder(token: string) {
    const input = subjectRef.current;
    const start = input?.selectionStart ?? subject.length;
    const end = input?.selectionEnd ?? subject.length;
    const next = `${subject.slice(0, start)}${token}${subject.slice(end)}`;
    if (next.length > BROADCAST_SUBJECT_MAX) return;
    setSubject(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function loadFromHistory(row: BroadcastHistoryRow) {
    setTemplateId("");
    setSubject(row.subject);
    setBody(row.body);
    setStatuses(row.statuses);
    setAttendance(row.attendance);
    showToast("Loaded the previous email into the editor", "success");
  }

  const canSend = !pending && statuses.length > 0 && hasContent && (recipientCount ?? 0) > 0;

  return (
    <Stack spacing={3}>
      <Alert severity="info">
        Emails go only to people who already registered for this event. Messages are queued and delivered in the background, a few at a time, so large audiences take a few minutes. Send yourself a test first.
      </Alert>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="h2">Start from a template</Typography>
            <Typography variant="body2" color="text.secondary">
              Reminders, agenda updates, speaker news, logistics, thank-yous, and more. Each one fills in the subject, message, and a suggested audience; everything stays editable.
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel id="broadcast-template-label">Template</InputLabel>
            <Select
              labelId="broadcast-template-label"
              label="Template"
              value={templateId}
              displayEmpty
              onChange={(event) => applyTemplate(String(event.target.value))}
              disabled={pending}
              renderValue={(value) => BROADCAST_STARTER_TEMPLATES.find((template) => template.id === value)?.name ?? "Custom (from a previous email)"}
            >
              {TEMPLATE_GROUPS.flatMap((group) => [
                <ListSubheader key={`group-${group}`} disableSticky>{group}</ListSubheader>,
                ...BROADCAST_STARTER_TEMPLATES.filter((template) => template.group === group).map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    <Stack>
                      <Typography variant="body2">{template.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{template.description}</Typography>
                    </Stack>
                  </MenuItem>
                )),
              ])}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Stack spacing={2.5}>
              <Typography variant="h6" component="h2">Who receives it</Typography>
              <FormControl component="fieldset" variant="standard">
                <FormLabel component="legend">Registration status</FormLabel>
                <FormGroup>
                  {BROADCAST_STATUS_OPTIONS.map((option) => (
                    <FormControlLabel
                      key={option.value}
                      control={<Checkbox checked={statuses.includes(option.value)} onChange={() => toggleStatus(option.value)} disabled={pending} />}
                      label={<span><strong>{option.label}</strong> <Typography component="span" variant="body2" color="text.secondary">— {option.hint}</Typography></span>}
                    />
                  ))}
                </FormGroup>
              </FormControl>
              <FormControl component="fieldset" variant="standard">
                <FormLabel component="legend">Attendance</FormLabel>
                <RadioGroup value={attendance} onChange={(_, value) => setAttendance(value as BroadcastAttendanceFilter)}>
                  {BROADCAST_ATTENDANCE_OPTIONS.map((option) => (
                    <FormControlLabel key={option.value} value={option.value} control={<Radio disabled={pending} />} label={option.label} />
                  ))}
                </RadioGroup>
              </FormControl>
              <Divider />
              <Box aria-live="polite">
                {countError ? <Alert severity="error">{countError}</Alert> : (
                  <Typography variant="body1">
                    {recipientCount === null ? "Counting recipients…" : (
                      <>
                        <strong>{recipientCount}</strong> {recipientCount === 1 ? "person" : "people"} will receive this ({audienceText}).
                      </>
                    )}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  One email per address, even if someone registered twice.
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack spacing={2}>
              <Typography variant="h6" component="h2">Message</Typography>
              <TextField
                label="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                inputRef={subjectRef}
                required
                fullWidth
                size="small"
                disabled={pending}
                slotProps={{ htmlInput: { maxLength: BROADCAST_SUBJECT_MAX } }}
                helperText={`${subject.length}/${BROADCAST_SUBJECT_MAX}`}
              />
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">Subject placeholders:</Typography>
                {SUBJECT_PLACEHOLDERS.map((placeholder) => (
                  <Tooltip key={placeholder.token} title={placeholder.description}>
                    <Chip label={placeholder.label} size="small" variant="outlined" onClick={() => insertSubjectPlaceholder(placeholder.token)} disabled={pending} />
                  </Tooltip>
                ))}
              </Stack>
              <BroadcastEmailEditor value={body} onChange={setBody} disabled={pending} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
            <Box>
              <Typography variant="h6" component="h2">Preview</Typography>
              <Typography variant="caption" color="text.secondary">
                Rendered by the server with example values, exactly as it will arrive. Each attendee sees their own name and, when confirmed, their own ticket link.
              </Typography>
            </Box>
            <ToggleButtonGroup size="small" exclusive value={previewWidth} onChange={(_, value) => value && setPreviewWidth(value)} aria-label="Preview width">
              <ToggleButton value="desktop" aria-label="Desktop width"><DesktopWindowsOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} /> Desktop</ToggleButton>
              <ToggleButton value="mobile" aria-label="Mobile width"><PhoneIphoneOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} /> Mobile</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {!hasContent ? (
            <Alert severity="info">Add a subject and a message to see the preview.</Alert>
          ) : preview.error && previewReady ? (
            <Alert severity="error">{preview.error}</Alert>
          ) : (
            <Box sx={{ position: "relative", bgcolor: "action.hover", borderRadius: 2, p: { xs: 1, sm: 2 }, display: "flex", justifyContent: "center" }}>
              {!previewReady ? (
                <Box sx={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 1 }} aria-live="polite">
                  <CircularProgress size={16} /> <Typography variant="caption">Updating…</Typography>
                </Box>
              ) : null}
              <Box sx={{ width: previewWidth === "mobile" ? 390 : "100%", maxWidth: 720, transition: "width 0.2s" }}>
                <Typography variant="subtitle2" sx={{ px: 1, pb: 1, color: "text.secondary" }}>
                  Subject: <Typography component="span" variant="subtitle2" sx={{ color: "text.primary", fontWeight: 700 }}>{preview.subject || "…"}</Typography>
                </Typography>
                <Box
                  component="iframe"
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  sx={{ width: "100%", height: 620, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "#f8f9fa", opacity: previewReady ? 1 : 0.6, transition: "opacity 0.2s" }}
                />
              </Box>
            </Box>
          )}
        </Stack>
      </Paper>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "flex-end" }}>
        <Button
          variant="outlined"
          startIcon={<ScienceOutlinedIcon />}
          disabled={pending || !hasContent}
          onClick={() => {
            startTransition(async () => {
              const result = await sendEventBroadcastTest({ organisationSlug, eventId, subject, body });
              if (!result.ok) return showToast(result.error, "error");
              showToast(`Test email queued to ${result.data?.to ?? "your address"}`, "success");
            });
          }}
        >
          Send a test to me
        </Button>
        <Button variant="contained" startIcon={<SendOutlinedIcon />} disabled={!canSend} onClick={() => setConfirmOpen(true)}>
          {recipientCount && recipientCount > 0 ? `Send to ${recipientCount} ${recipientCount === 1 ? "person" : "people"}` : "Send"}
        </Button>
      </Stack>

      <ConfirmationDialog
        open={confirmOpen}
        title="Send this email?"
        message={`“${preview.subject || subject}” will be queued for ${recipientCount ?? 0} ${recipientCount === 1 ? "person" : "people"} (${audienceText}). This cannot be recalled once delivery starts.`}
        confirmLabel="Send email"
        loading={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const result = await sendEventBroadcast({ organisationSlug, eventId, statuses, attendance, subject, body });
            setConfirmOpen(false);
            if (!result.ok) return showToast(result.error, "error");
            showToast(`Queued for ${result.data?.recipientCount ?? 0} recipients`, "success");
            router.refresh();
          });
        }}
      />

      <Stack spacing={1.5}>
        <Typography variant="h6" component="h2">Previously sent</Typography>
        {history.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography color="text.secondary">No emails have been sent for this event yet.</Typography>
          </Paper>
        ) : history.map((row) => (
          <Paper key={row.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{row.subject}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(row.createdAt).toLocaleString()} · {row.recipientCount} {row.recipientCount === 1 ? "recipient" : "recipients"} · {describeBroadcastAudience(row.statuses, row.attendance)}
                  {row.createdByName ? ` · by ${row.createdByName}` : ""}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap", color: "text.secondary", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {broadcastHtmlToText(row.body)}
                </Typography>
              </Box>
              <Button size="small" variant="outlined" onClick={() => loadFromHistory(row)} disabled={pending} sx={{ flexShrink: 0 }}>
                Reuse
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
