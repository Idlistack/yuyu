"use client";

import { useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormLabel from "@mui/material/FormLabel";
import FormControl from "@mui/material/FormControl";
import Stack from "@mui/material/Stack";
import Autocomplete from "@mui/material/Autocomplete";
import Link from "next/link";
import type { RsvpStatus } from "@prisma/client";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";

// MUI's outlined input labels intentionally truncate to a single line. In an
// RSVP form, custom labels are attendee-facing questions, so hiding part of a
// question is worse than allowing the field to take an extra line on a phone.
const rsvpFormSx = {
  "@media (max-width: 599.95px)": {
    "& .MuiInputLabel-root": {
      position: "static",
      transform: "none !important",
      maxWidth: "none",
      overflow: "visible",
      textOverflow: "clip",
      whiteSpace: "normal",
      lineHeight: 1.3,
      marginBottom: 0.5,
    },
  },
} as const;

const phoneCountries = [
  ["AF", "Afghanistan", "+93"], ["AL", "Albania", "+355"], ["AR", "Argentina", "+54"], ["AU", "Australia", "+61"], ["AT", "Austria", "+43"], ["BD", "Bangladesh", "+880"], ["BE", "Belgium", "+32"], ["BR", "Brazil", "+55"], ["CA", "Canada", "+1"], ["CL", "Chile", "+56"], ["CN", "China", "+86"], ["CO", "Colombia", "+57"], ["DK", "Denmark", "+45"], ["EG", "Egypt", "+20"], ["FI", "Finland", "+358"], ["FR", "France", "+33"], ["DE", "Germany", "+49"], ["GR", "Greece", "+30"], ["HK", "Hong Kong", "+852"], ["HU", "Hungary", "+36"], ["IN", "India", "+91"], ["ID", "Indonesia", "+62"], ["IE", "Ireland", "+353"], ["IL", "Israel", "+972"], ["IT", "Italy", "+39"], ["JP", "Japan", "+81"], ["KE", "Kenya", "+254"], ["MY", "Malaysia", "+60"], ["MX", "Mexico", "+52"], ["NL", "Netherlands", "+31"], ["NZ", "New Zealand", "+64"], ["NG", "Nigeria", "+234"], ["NO", "Norway", "+47"], ["PK", "Pakistan", "+92"], ["PH", "Philippines", "+63"], ["PL", "Poland", "+48"], ["PT", "Portugal", "+351"], ["QA", "Qatar", "+974"], ["RO", "Romania", "+40"], ["RU", "Russia", "+7"], ["SA", "Saudi Arabia", "+966"], ["SG", "Singapore", "+65"], ["ZA", "South Africa", "+27"], ["KR", "South Korea", "+82"], ["ES", "Spain", "+34"], ["SE", "Sweden", "+46"], ["CH", "Switzerland", "+41"], ["TW", "Taiwan", "+886"], ["TH", "Thailand", "+66"], ["TR", "Turkey", "+90"], ["AE", "United Arab Emirates", "+971"], ["GB", "United Kingdom", "+44"], ["US", "United States", "+1"], ["VN", "Vietnam", "+84"],
] .map(([id, label, dial]) => ({ id, label, dial }));

type PhoneCountry = (typeof phoneCountries)[number];

function getPhoneParts(raw: unknown) {
  const s = normalizePhoneInput(typeof raw === "string" ? raw : "");
  const knownDial = [...phoneCountries]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => s.startsWith(c.dial))?.dial;
  // Calling codes are at most three digits. Retaining an unlisted prefix lets
  // attendees use every E.164 country code, not only the convenience list.
  const dial = knownDial ?? s.match(/^\+\d{1,3}/)?.[0] ?? "+91";
  const number = s.startsWith(dial) ? s.slice(dial.length) : s;
  return { dial, number: number.replace(/[^\d]/g, "") };
}

function normalizePhoneInput(value: string) {
  const trimmed = value.trim();
  const withInternationalPrefix = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const digits = withInternationalPrefix.replace(/[^\d]/g, "");
  return withInternationalPrefix.startsWith("+") ? `+${digits.slice(0, 15)}` : digits.slice(0, 15);
}

function normalizeDial(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 3);
  return digits ? `+${digits}` : "+";
}

function setPhoneValue(
  current: unknown,
  next: { dial?: string; number?: string },
): string {
  const parts = getPhoneParts(current);
  const dial = next.dial ? normalizeDial(next.dial) : parts.dial;
  const number = (next.number ?? parts.number).replace(/[^\d]/g, "").slice(0, Math.max(0, 15 - (dial.length - 1)));
  return number ? `${dial}${number}` : "";
}

function PhoneField(props: {
  field: RegistrationFieldDefinition;
  value: unknown;
  onChange: (value: string) => void;
}) {
  const { field, value, onChange } = props;
  const parts = getPhoneParts(value);
  const selectedCountry = phoneCountries.find((country) => country.dial === parts.dial) ?? null;
  const maxLength = parts.dial === "+91" ? 10 : Math.max(1, 15 - (parts.dial.length - 1));

  return (
    <Stack key={field.key} direction={{ xs: "column", sm: "row" }} spacing={1}>
      <Autocomplete<PhoneCountry, false, false, true>
        freeSolo
        autoHighlight
        options={phoneCountries}
        value={selectedCountry ?? parts.dial}
        getOptionLabel={(option) => typeof option === "string" ? option : option.dial}
        isOptionEqualToValue={(option, selected) => typeof selected !== "string" && option.id === selected.id}
        filterOptions={(options, state) => {
          const query = state.inputValue.trim().toLowerCase();
          if (!query) return options;
          return options.filter((option) =>
            [option.id, option.label, option.dial].some((value) => value.toLowerCase().includes(query)),
          );
        }}
        onChange={(_, option) => onChange(setPhoneValue(value, { dial: typeof option === "string" ? option : option?.dial ?? "" }))}
        renderOption={(optionProps, option) => (
          <li {...optionProps}>
            {option.label} ({option.dial})
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Country code"
            required={field.required}
            inputMode="tel"
            helperText="Search a country or enter a + calling code."
          />
        )}
        sx={{ width: { xs: "100%", sm: 120 }, flexShrink: 0 }}
      />
      <TextField
        label={field.label}
        required={field.required}
        fullWidth
        value={parts.number}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next.trimStart().startsWith("+") || next.trimStart().startsWith("00")
            ? normalizePhoneInput(next)
            : setPhoneValue(value, { number: next }));
        }}
        inputMode="tel"
        placeholder="Phone number"
        slotProps={{ htmlInput: { inputMode: "tel", pattern: "[0-9]*", maxLength } }}
        helperText={parts.dial === "+91" ? "Indian mobile numbers must be 10 digits and start with 6–9." : "You can also paste a complete international number here."}
      />
    </Stack>
  );
}

async function postRsvp(body: unknown) {
  const res = await fetch("/api/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let data: { ok?: boolean; error?: string; data?: { ticketToken?: string; status?: RsvpStatus } } = {};
  try {
    data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      data?: { ticketToken?: string; status?: RsvpStatus };
    };
  } catch {
    /* empty */
  }
  if (res.status === 429) {
    return {
      ok: false as const,
      error: data.error ?? "Too many requests. Try again later.",
    };
  }
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error ?? "Could not save your RSVP.",
    };
  }
  if (data.ok) {
    return {
      ok: true as const,
      ticketToken: data.data?.ticketToken ?? "",
      status: data.data?.status ?? null,
    };
  }
  return {
    ok: false as const,
    error: data.error ?? "Could not save your RSVP.",
  };
}

function storageKey(params: {
  orgSlug: string;
  eventSlug?: string;
  eventInstanceId?: string;
}) {
  const suffix = params.eventInstanceId
    ? `i:${params.eventInstanceId}`
    : `e:${params.eventSlug ?? ""}`;
  return `yuyu:rsvp:${params.orgSlug}:${suffix}`;
}

function safeJsonParse<T>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

export function RsvpForm(props: {
  orgSlug: string;
  eventSlug?: string;
  eventInstanceId?: string;
  registrationFields?: RegistrationFieldDefinition[];
  /** Lets a containing event page update immediately after this tab saves an RSVP. */
  onRsvpSaved?: (rsvp: { ticketToken: string; status: RsvpStatus | null }) => void;
}) {
  const { orgSlug, eventSlug, eventInstanceId, registrationFields, onRsvpSaved } = props;
  const { data: session, status } = useSession();
  const lsKey = storageKey({ orgSlug, eventSlug, eventInstanceId });
  const [guestEmail, setGuestEmail] = useState("");
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus | null>(null);
  const [ticketToken, setTicketToken] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = safeJsonParse<{ ticketToken?: string }>(
        window.localStorage.getItem(lsKey),
      );
      setTicketToken(saved?.ticketToken ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [lsKey]);
  const [pending, startTransition] = useTransition();

  const fields = registrationFields ?? [];
  const requireName = !session?.user?.name?.trim();

  function setAnswer(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function saveSuccessfulRsvp(rsvp: { ticketToken: string; status: RsvpStatus | null }) {
    setTicketToken(rsvp.ticketToken);
    setRsvpStatus(rsvp.status);
    if (rsvp.ticketToken) {
      try {
        window.localStorage.setItem(
          lsKey,
          JSON.stringify({
            ticketToken: rsvp.ticketToken,
            status: rsvp.status,
            registeredAt: new Date().toISOString(),
          }),
        );
      } catch {
        // The confirmed server state remains usable in this open page even if
        // this browser has disabled local storage.
      }
    }
    onRsvpSaved?.(rsvp);
    setDone(true);
  }

  if (status === "loading") {
    return <Typography color="text.secondary">Loading…</Typography>;
  }

  if (done) {
    const href = ticketToken ? `/ticket/${ticketToken}` : null;
    const ticketDownloadUrl = ticketToken
      ? `/api/ticket/${ticketToken}/download`
      : null;
    const isConfirmed = rsvpStatus === "CONFIRMED";
    return (
      <Alert severity="success">
        <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography variant="body2">
            {isConfirmed
              ? "Registration confirmed. Download and save your ticket now — you’ll need it for check-in."
              : "Registration received. We’ll let you know when its status changes."}
          </Typography>
          {isConfirmed && ticketDownloadUrl ? (
            <Button
              component="a"
              href={ticketDownloadUrl}
              download
              variant="contained"
              size="small"
              sx={{ borderRadius: 999 }}
            >
              Download and save ticket
            </Button>
          ) : null}
          {isConfirmed && href ? (
            <Button component={Link} href={href} variant="outlined" size="small" sx={{ borderRadius: 999 }}>
              View ticket
            </Button>
          ) : null}
        </Stack>
      </Alert>
    );
  }

  if (session?.user) {
    return (
      <Box sx={rsvpFormSx}>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mb: 2 }}>
          <TextField
            name="name"
            label="Name"
            required={requireName}
            fullWidth
            value={name}
            placeholder={session.user.name ?? ""}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {fields.map((f) => {
            switch (f.type) {
              case "TEXT":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    slotProps={{ htmlInput: { maxLength: 200 } }}
                  />
                );
              case "EMAIL":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    type="email"
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    helperText="We’ll validate basic email format."
                  />
                );
              case "PHONE":
                return <PhoneField key={f.key} field={f} value={answers[f.key]} onChange={(value) => setAnswer(f.key, value)} />;
              case "TEXTAREA":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    multiline
                    minRows={3}
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    slotProps={{ htmlInput: { maxLength: 5000 } }}
                  />
                );
              case "NUMBER":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    type="number"
                    value={(answers[f.key] as string | number | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                  />
                );
              case "DATE":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    type="date"
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                  />
                );
              case "CHECKBOX":
                return (
                  <FormControlLabel
                    key={f.key}
                    control={
                      <Checkbox
                        checked={Boolean(answers[f.key])}
                        onChange={(_, checked) => setAnswer(f.key, checked)}
                      />
                    }
                    label={f.label}
                  />
                );
              case "SELECT":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    select
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                  >
                    <MenuItem value="">—</MenuItem>
                    {f.options.map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              case "MULTI_SELECT": {
                const value = Array.isArray(answers[f.key])
                  ? (answers[f.key] as string[])
                  : [];
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    select
                    slotProps={{ select: { multiple: true } }}
                    value={value}
                    onChange={(e) =>
                      setAnswer(
                        f.key,
                        typeof e.target.value === "string"
                          ? e.target.value.split(",")
                          : e.target.value,
                      )
                    }
                  >
                    {f.options.map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              }
              case "RADIO":
                return (
                  <FormControl key={f.key} required={f.required}>
                    <FormLabel>{f.label}</FormLabel>
                    <RadioGroup
                      value={(answers[f.key] as string | undefined) ?? ""}
                      onChange={(e) => setAnswer(f.key, e.target.value)}
                    >
                      {f.options.map((opt) => (
                        <FormControlLabel
                          key={opt}
                          value={opt}
                          control={<Radio />}
                          label={opt}
                        />
                      ))}
                    </RadioGroup>
                  </FormControl>
                );
              default:
                return null;
            }
          })}
        </Stack>
        <Button
          variant="contained"
          size="large"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await postRsvp({
                orgSlug,
                ...(eventInstanceId
                  ? { eventInstanceId }
                  : { eventSlug: eventSlug! }),
                name,
                answers,
              });
              if (!res.ok) setError(res.error);
              else {
                saveSuccessfulRsvp({ ticketToken: res.ticketToken, status: res.status });
              }
            });
          }}
        >
          Register
        </Button>
      </Box>
    );
  }

  return (
    <Box
      component="form"
      sx={rsvpFormSx}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await postRsvp({
            orgSlug,
            ...(eventInstanceId
              ? { eventInstanceId }
              : { eventSlug: eventSlug! }),
            guestEmail,
            name,
            answers,
          });
          if (!res.ok) setError(res.error);
          else {
            saveSuccessfulRsvp({ ticketToken: res.ticketToken, status: res.status });
          }
        });
      }}
    >
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Register with your email
      </Typography>
      <TextField
        name="name"
        label="Name"
        required
        fullWidth
        value={name}
        onChange={(e) => setName(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        sx={{ mb: 2 }}
      />
      <TextField
        name="guestEmail"
        label="Email"
        type="email"
        required
        fullWidth
        value={guestEmail}
        onChange={(e) => setGuestEmail(e.target.value)}
        sx={{ mb: 2 }}
      />
      {fields.length > 0 ? (
        <Stack spacing={2} sx={{ mb: 2 }}>
          {fields.map((f) => {
            switch (f.type) {
              case "TEXT":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    slotProps={{ htmlInput: { maxLength: 200 } }}
                  />
                );
              case "EMAIL":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    type="email"
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    helperText="We’ll validate basic email format."
                  />
                );
              case "PHONE":
                return <PhoneField key={f.key} field={f} value={answers[f.key]} onChange={(value) => setAnswer(f.key, value)} />;
              case "TEXTAREA":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    multiline
                    minRows={3}
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    slotProps={{ htmlInput: { maxLength: 5000 } }}
                  />
                );
              case "NUMBER":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    type="number"
                    value={(answers[f.key] as string | number | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                  />
                );
              case "DATE":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    type="date"
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                  />
                );
              case "CHECKBOX":
                return (
                  <FormControlLabel
                    key={f.key}
                    control={
                      <Checkbox
                        checked={Boolean(answers[f.key])}
                        onChange={(_, checked) => setAnswer(f.key, checked)}
                      />
                    }
                    label={f.label}
                  />
                );
              case "SELECT":
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    select
                    value={(answers[f.key] as string | undefined) ?? ""}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                  >
                    <MenuItem value="">—</MenuItem>
                    {f.options.map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              case "MULTI_SELECT": {
                const value = Array.isArray(answers[f.key])
                  ? (answers[f.key] as string[])
                  : [];
                return (
                  <TextField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    fullWidth
                    select
                    slotProps={{ select: { multiple: true } }}
                    value={value}
                    onChange={(e) =>
                      setAnswer(
                        f.key,
                        typeof e.target.value === "string"
                          ? e.target.value.split(",")
                          : e.target.value,
                      )
                    }
                  >
                    {f.options.map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              }
              case "RADIO":
                return (
                  <FormControl key={f.key} required={f.required}>
                    <FormLabel>{f.label}</FormLabel>
                    <RadioGroup
                      value={(answers[f.key] as string | undefined) ?? ""}
                      onChange={(e) => setAnswer(f.key, e.target.value)}
                    >
                      {f.options.map((opt) => (
                        <FormControlLabel
                          key={opt}
                          value={opt}
                          control={<Radio />}
                          label={opt}
                        />
                      ))}
                    </RadioGroup>
                  </FormControl>
                );
              default:
                return null;
            }
          })}
        </Stack>
      ) : null}
      <Button variant="contained" size="large" disabled={pending} type="submit">
        Register
      </Button>
    </Box>
  );
}
