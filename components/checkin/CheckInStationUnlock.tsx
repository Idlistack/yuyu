"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { normalizeStationPin } from "@/lib/stationPin";

export function CheckInStationUnlock({ organisationSlug, eventSlug }: { organisationSlug: string; eventSlug: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (pin.length !== 8) {
      setError("Enter the complete 8-digit station PIN.");
      return;
    }
    setPending(true); setError(null);
    try {
      const response = await fetch("/api/check-in/station", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ organisationSlug, eventSlug, action: "unlock", pin }) });
      const result = response.headers.get("content-type")?.includes("application/json")
        ? await response.json() as { ok: boolean; error?: string }
        : { ok: false, error: "Unable to open this check-in station." };
      if (!result.ok) setError(result.error ?? "Unable to open this check-in station.");
      else window.location.reload();
    } catch { setError("Unable to open this check-in station."); }
    finally { setPending(false); }
  };
  return <Paper component="form" onSubmit={submit} variant="outlined" sx={{ maxWidth: 440, mx: "auto", mt: 6, p: 3 }}>
    <Stack spacing={2}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>Venue check-in</Typography>
      <Typography color="text.secondary">Enter the 8-digit PIN provided by the event organiser.</Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <TextField
        label="Station PIN"
        name="station-pin"
        type="text"
        value={pin}
        onChange={(e) => { setPin(normalizeStationPin(e.target.value)); setError(null); }}
        slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*", maxLength: 8, autoComplete: "one-time-code", spellCheck: false, "aria-describedby": "station-pin-help" } }}
        helperText={<span id="station-pin-help">{pin.length}/8 digits</span>}
        autoFocus
        required
        fullWidth
      />
      <Button type="submit" variant="contained" disabled={pending || pin.length !== 8}>Open check-in</Button>
    </Stack>
  </Paper>;
}
