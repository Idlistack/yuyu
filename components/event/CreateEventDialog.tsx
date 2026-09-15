"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import { createEvent } from "@/app/actions/event";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import Chip from "@mui/material/Chip";

const timezones = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function toDatetimeLocalValue(d: Date) {
  const t = new Date(d);
  const off = t.getTimezoneOffset() * 60000;
  return new Date(t.getTime() - off).toISOString().slice(0, 16);
}

function isRichTextEmpty(html: string) {
  return !new DOMParser().parseFromString(html, "text/html").body.textContent?.trim();
}

export function CreateEventDialog(props: {
  organisationSlug: string;
  variant?: "button" | "fab";
}) {
  const { organisationSlug, variant = "button" } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [tagsPreview, setTagsPreview] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Wizard States
  const [activeStep, setActiveStep] = useState(0);
  const [isOnline, setIsOnline] = useState(false);

  const resetDraft = () => {
    setActiveStep(0);
    setError(null);
    setStart(null);
    setEnd(null);
    setTagsPreview([]);
    setTagInput("");
    setIsOnline(false);
    setFormKey((current) => current + 1);
  };

  const closeDialog = () => {
    if (pending) return;
    setOpen(false);
    resetDraft();
  };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (activeStep !== 2) return;
    setError(null);
    if (!start || start < new Date()) {
      setError("Start time must be now or in the future.");
      setActiveStep(1);
      return;
    }
    if (!end || end <= start) {
      setError("End time must be after start time.");
      setActiveStep(1);
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await createEvent({
        organisationSlug,
        title: String(fd.get("title") ?? ""),
        aboutHtml: String(fd.get("aboutHtml") ?? ""),
        tags: String(fd.get("tags") ?? ""),
        coverImageUrl: "",
        startDateTime: String(fd.get("startDateTime") ?? ""),
        endDateTime: String(fd.get("endDateTime") ?? ""),
        timezone: String(fd.get("timezone") ?? "Asia/Kolkata"),
        location: String(fd.get("location") ?? ""),
        mapLinkUrl: String(fd.get("mapLinkUrl") ?? ""),
        isOnline: isOnline,
        capacity: "",
        status: EventStatus.DRAFT,
        privacyType: EventPrivacyType.PUBLIC,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeDialog();
      if (res.data?.id) {
        router.push(`/dashboard/${organisationSlug}/event/${res.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  const handleOpen = () => {
    resetDraft();
    const now = new Date();
    const base = new Date(now);
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
    setStart(base);
    const e = new Date(base);
    e.setHours(e.getHours() + 1);
    setEnd(e);
    setOpen(true);
  };

  return (
    <>
      {variant === "fab" ? (
        <Fab color="primary" aria-label="Create event" onClick={handleOpen}>
          <AddIcon />
        </Fab>
      ) : (
        <Button variant="contained" onClick={handleOpen}>
          New event
        </Button>
      )}
      <Dialog
        open={open}
        onClose={closeDialog}
        fullWidth
        maxWidth="sm"
      >
        <form
          key={formKey}
          ref={formRef}
          onSubmit={onSubmit}
          onKeyDown={(event) => {
            if (activeStep === 2 && event.key === "Enter" && event.target instanceof HTMLInputElement) {
              event.preventDefault();
            }
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            {activeStep === 0 && "Create Event: Basics"}
            {activeStep === 1 && "Create Event: Schedule"}
            {activeStep === 2 && "Create Event: Location"}
          </DialogTitle>
          <DialogContent>
            {/* Step Progress Indicators */}
            <Box
              sx={{
                mb: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 700, letterSpacing: "0.5px" }}
              >
                {activeStep === 0 && "BASICS"}
                {activeStep === 1 && "SCHEDULE"}
                {activeStep === 2 && "LOCATION & PLATFORM"}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600 }}
              >
                Step {activeStep + 1} of 3
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.75, mb: 3 }}>
              {[0, 1, 2].map((stepIndex) => (
                <Box
                  key={stepIndex}
                  sx={{
                    flexGrow: 1,
                    height: 4,
                    borderRadius: 1,
                    backgroundColor:
                      stepIndex <= activeStep
                        ? "primary.main"
                        : "rgba(255,255,255,0.1)",
                    transition: "all 0.3s ease",
                  }}
                />
              ))}
            </Box>

            <Stack spacing={2} sx={{ mt: 1 }}>
              {error ? <Alert severity="error">{error}</Alert> : null}

              {/* Step 1: Basics */}
              <Box
                sx={{
                  display: activeStep === 0 ? "flex" : "none",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <TextField
                  name="title"
                  label="Title"
                  required
                  fullWidth
                  autoFocus
                />
                <RichTextEditor
                  name="aboutHtml"
                  label="About the event"
                  helperText="Required. Share the key details attendees should know."
                  minHeight={160}
                />
                <TextField
                  label="Tags"
                  fullWidth
                  value={tagInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.endsWith(",")) {
                      const tag = val
                        .slice(0, -1)
                        .trim()
                        .toLowerCase()
                        .replace(/\s+/g, " ");
                      if (
                        tag &&
                        !tagsPreview.includes(tag) &&
                        tagsPreview.length < 12
                      ) {
                        setTagsPreview([...tagsPreview, tag]);
                      }
                      setTagInput("");
                    } else {
                      setTagInput(val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const tag = tagInput
                        .trim()
                        .toLowerCase()
                        .replace(/\s+/g, " ");
                      if (
                        tag &&
                        !tagsPreview.includes(tag) &&
                        tagsPreview.length < 12
                      ) {
                        setTagsPreview([...tagsPreview, tag]);
                      }
                      setTagInput("");
                    }
                  }}
                  placeholder="Type a tag and press Enter or Comma"
                  helperText="Press Enter or Comma to add up to 12 tags (e.g. workshop, meetup, ai)."
                />
                <input
                  type="hidden"
                  name="tags"
                  value={tagsPreview.join(",")}
                />
                {tagsPreview.length > 0 ? (
                  <Stack
                    direction="row"
                    useFlexGap
                    sx={{
                      flexWrap: "wrap",
                      columnGap: 0.75,
                      rowGap: 0.75,
                      mt: 0.5,
                    }}
                  >
                    {tagsPreview.map((t) => (
                      <Chip
                        key={t}
                        size="small"
                        label={t}
                        onDelete={() => {
                          setTagsPreview(tagsPreview.filter((x) => x !== t));
                        }}
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                ) : null}
              </Box>

              {/* Step 2: Schedule */}
              <Box
                sx={{
                  display: activeStep === 1 ? "flex" : "none",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DateTimePicker
                    label="Start"
                    value={start}
                    onChange={(v) => {
                      setStart(v);
                      if (v) {
                        setEnd(new Date(v.getTime() + 60 * 60 * 1000));
                      }
                    }}
                    minDateTime={new Date()}
                    slotProps={{
                      textField: {
                        required: true,
                        fullWidth: true,
                        helperText: "Pick date and time",
                      },
                    }}
                  />
                  <DateTimePicker
                    label="End"
                    value={end}
                    onChange={(v) => setEnd(v)}
                    minDateTime={start ?? undefined}
                    slotProps={{
                      textField: {
                        required: true,
                        fullWidth: true,
                        helperText: "Must be after start",
                      },
                    }}
                  />
                </LocalizationProvider>
                <input
                  type="hidden"
                  name="startDateTime"
                  value={start ? toDatetimeLocalValue(start) : ""}
                />
                <input
                  type="hidden"
                  name="endDateTime"
                  value={end ? toDatetimeLocalValue(end) : ""}
                />
                <TextField
                  name="timezone"
                  label="Timezone"
                  select
                  required
                  fullWidth
                  defaultValue="Asia/Kolkata"
                >
                  {timezones.map((tz) => (
                    <MenuItem key={tz} value={tz}>
                      {tz}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              {/* Step 3: Location */}
              <Box
                sx={{
                  display: activeStep === 2 ? "flex" : "none",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      name="isOnline"
                      checked={isOnline}
                      onChange={(e) => setIsOnline(e.target.checked)}
                    />
                  }
                  label="Online event"
                />
                <TextField
                  name="location"
                  label={isOnline ? "Online meeting link" : "Location"}
                  required
                  fullWidth
                  type={isOnline ? "url" : "text"}
                  placeholder={
                    isOnline
                      ? "https://meet.google.com/..."
                      : "e.g., 123 Main St, San Francisco, CA"
                  }
                  helperText={
                    isOnline
                      ? "Enter a valid HTTP(S) meeting URL."
                      : "Enter the venue or street address."
                  }
                />
                {!isOnline && (
                  <TextField
                    name="mapLinkUrl"
                    label="Map link (optional)"
                    fullWidth
                    type="url"
                    helperText="Paste a Google Maps link for directions (physical events only)."
                  />
                )}
              </Box>

            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between" }}>
            <Box>
              {activeStep > 0 && (
                <Button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setActiveStep((prev) => prev - 1);
                  }}
                  disabled={pending}
                >
                  Back
                </Button>
              )}
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                type="button"
                onClick={closeDialog}
                disabled={pending}
              >
                Cancel
              </Button>
              {activeStep < 2 ? (
                <Button
                  type="button"
                  variant="contained"
                  onClick={() => {
                    setError(null);
                    if (activeStep === 0) {
                      const titleInput = formRef.current?.elements.namedItem(
                        "title",
                      ) as HTMLInputElement | null;
                      if (!titleInput?.value.trim()) {
                        titleInput?.focus();
                        titleInput?.reportValidity();
                        return;
                      }
                      const aboutInput = formRef.current?.elements.namedItem(
                        "aboutHtml",
                      ) as HTMLInputElement | null;
                      if (isRichTextEmpty(aboutInput?.value ?? "")) {
                        setError("Add a short description for your event.");
                        return;
                      }
                    }
                    if (activeStep === 1) {
                      if (!start || !end) {
                        setError("Please select both start and end times.");
                        return;
                      }
                      if (start < new Date()) {
                        setError("Start time must be now or in the future.");
                        return;
                      }
                      if (end <= start) {
                        setError("End time must be after start time.");
                        return;
                      }
                    }
                    if (activeStep === 2) {
                      const locInput = formRef.current?.elements.namedItem(
                        "location",
                      ) as HTMLInputElement | null;
                      if (!locInput?.value.trim()) {
                        locInput?.focus();
                        locInput?.reportValidity();
                        return;
                      }
                      const mapLinkInput = formRef.current?.elements.namedItem(
                        "mapLinkUrl",
                      ) as HTMLInputElement | null;
                      if (
                        mapLinkInput?.value &&
                        !mapLinkInput.checkValidity()
                      ) {
                        mapLinkInput.focus();
                        mapLinkInput.reportValidity();
                        return;
                      }
                    }
                    setActiveStep((prev) => prev + 1);
                  }}
                >
                  Next
                </Button>
              ) : (
                <Button type="submit" variant="contained" disabled={pending}>
                  Create
                </Button>
              )}
            </Stack>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
