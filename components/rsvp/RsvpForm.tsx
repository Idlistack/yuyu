"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { RsvpStatus } from "@prisma/client";
import { CheckCircle2, Download } from "lucide-react";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { CheckboxField, FilterChip, Radio, RadioGroup } from "@/components/ui/choice";
import { controlClasses } from "@/components/ui/styles";
import { cn } from "@/lib/cn";

const phoneCountries = [
  ["AF", "Afghanistan", "+93"], ["AL", "Albania", "+355"], ["AR", "Argentina", "+54"], ["AU", "Australia", "+61"], ["AT", "Austria", "+43"], ["BD", "Bangladesh", "+880"], ["BE", "Belgium", "+32"], ["BR", "Brazil", "+55"], ["CA", "Canada", "+1"], ["CL", "Chile", "+56"], ["CN", "China", "+86"], ["CO", "Colombia", "+57"], ["DK", "Denmark", "+45"], ["EG", "Egypt", "+20"], ["FI", "Finland", "+358"], ["FR", "France", "+33"], ["DE", "Germany", "+49"], ["GR", "Greece", "+30"], ["HK", "Hong Kong", "+852"], ["HU", "Hungary", "+36"], ["IN", "India", "+91"], ["ID", "Indonesia", "+62"], ["IE", "Ireland", "+353"], ["IL", "Israel", "+972"], ["IT", "Italy", "+39"], ["JP", "Japan", "+81"], ["KE", "Kenya", "+254"], ["MY", "Malaysia", "+60"], ["MX", "Mexico", "+52"], ["NL", "Netherlands", "+31"], ["NZ", "New Zealand", "+64"], ["NG", "Nigeria", "+234"], ["NO", "Norway", "+47"], ["PK", "Pakistan", "+92"], ["PH", "Philippines", "+63"], ["PL", "Poland", "+48"], ["PT", "Portugal", "+351"], ["QA", "Qatar", "+974"], ["RO", "Romania", "+40"], ["RU", "Russia", "+7"], ["SA", "Saudi Arabia", "+966"], ["SG", "Singapore", "+65"], ["ZA", "South Africa", "+27"], ["KR", "South Korea", "+82"], ["ES", "Spain", "+34"], ["SE", "Sweden", "+46"], ["CH", "Switzerland", "+41"], ["TW", "Taiwan", "+886"], ["TH", "Thailand", "+66"], ["TR", "Turkey", "+90"], ["AE", "United Arab Emirates", "+971"], ["GB", "United Kingdom", "+44"], ["US", "United States", "+1"], ["VN", "Vietnam", "+84"],
] .map(([id, label, dial]) => ({ id, label, dial }));

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
  const maxLength = parts.dial === "+91" ? 10 : Math.max(1, 15 - (parts.dial.length - 1));
  const baseId = useId();
  const listId = `${baseId}-countries`;
  const numberId = `${baseId}-number`;
  const helpId = `${baseId}-help`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={numberId} className="text-label text-ink">
        {field.label}
        {field.required ? null : <span className="ml-1.5 font-normal text-ink-muted">Optional</span>}
      </label>
      <div className="flex gap-2">
        <div className="w-[112px] shrink-0">
          <label htmlFor={`${baseId}-dial`} className="sr-only">Country code</label>
          <input
            id={`${baseId}-dial`}
            list={listId}
            inputMode="tel"
            autoComplete="tel-country-code"
            value={parts.dial}
            required={field.required}
            onChange={(event) => {
              const typed = event.target.value;
              const match = phoneCountries.find((country) => `${country.label} (${country.dial})` === typed || country.label.toLowerCase() === typed.trim().toLowerCase());
              onChange(setPhoneValue(value, { dial: match ? match.dial : typed }));
            }}
            className={controlClasses}
            aria-describedby={helpId}
          />
          <datalist id={listId}>
            {phoneCountries.map((country) => (
              <option key={country.id} value={country.dial} label={`${country.label} (${country.dial})`} />
            ))}
          </datalist>
        </div>
        <input
          id={numberId}
          required={field.required}
          value={parts.number}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next.trimStart().startsWith("+") || next.trimStart().startsWith("00")
              ? normalizePhoneInput(next)
              : setPhoneValue(value, { number: next }));
          }}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="Phone number"
          pattern="[0-9]*"
          maxLength={maxLength}
          className={cn(controlClasses, "min-w-0 flex-1")}
          aria-describedby={helpId}
        />
      </div>
      <p id={helpId} className="text-caption text-ink-muted">
        {parts.dial === "+91" ? "Indian mobile numbers must be 10 digits and start with 6–9." : "Choose a country code, or paste a complete international number."}
      </p>
    </div>
  );
}

/** Renders one custom registration question with the shared field components. */
function QuestionField({ field, value, onChange }: { field: RegistrationFieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  const optional = !field.required;
  switch (field.type) {
    case "TEXT":
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <Input value={(value as string | undefined) ?? ""} onChange={(event) => onChange(event.target.value)} maxLength={200} />
        </Field>
      );
    case "EMAIL":
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <Input type="email" autoComplete="email" value={(value as string | undefined) ?? ""} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case "PHONE":
      return <PhoneField field={field} value={value} onChange={onChange} />;
    case "TEXTAREA":
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <Textarea rows={3} value={(value as string | undefined) ?? ""} onChange={(event) => onChange(event.target.value)} maxLength={5000} />
        </Field>
      );
    case "NUMBER":
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <Input type="number" inputMode="decimal" value={(value as string | number | undefined) ?? ""} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case "DATE":
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <Input type="date" value={(value as string | undefined) ?? ""} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case "CHECKBOX":
      return <CheckboxField label={field.label} checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked === true)} />;
    case "SELECT":
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <NativeSelect value={(value as string | undefined) ?? ""} onChange={(event) => onChange(event.target.value)}>
            <option value="">Choose…</option>
            {field.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </NativeSelect>
        </Field>
      );
    case "MULTI_SELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label text-ink">
            {field.label}
            {optional ? <span className="ml-1.5 font-normal text-ink-muted">Optional</span> : null}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {field.options.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <FilterChip
                  key={option}
                  selected={isSelected}
                  onClick={() => onChange(isSelected ? selected.filter((item) => item !== option) : [...selected, option])}
                >
                  {option}
                </FilterChip>
              );
            })}
          </div>
          <p className="text-caption text-ink-muted">Choose all that apply.</p>
        </fieldset>
      );
    }
    case "RADIO":
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-label text-ink">
            {field.label}
            {optional ? <span className="ml-1.5 font-normal text-ink-muted">Optional</span> : null}
          </legend>
          <RadioGroup value={(value as string | undefined) ?? ""} onValueChange={onChange} required={field.required}>
            {field.options.map((option) => (
              <Radio key={option} value={option} label={option} />
            ))}
          </RadioGroup>
        </fieldset>
      );
    default:
      return null;
  }
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
    return <p className="text-body-ui text-ink-muted">Loading…</p>;
  }

  if (done) {
    const href = ticketToken ? `/ticket/${ticketToken}` : null;
    const ticketDownloadUrl = ticketToken ? `/api/ticket/${ticketToken}/download` : null;
    const isConfirmed = rsvpStatus === "CONFIRMED";
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-lg bg-success-bg p-5 text-success-fg">
        <CheckCircle2 aria-hidden className="yy-success-in size-8" />
        <p className="text-body font-semibold">
          {isConfirmed
            ? "Registration confirmed. Download and save your ticket now — you’ll need it for check-in."
            : "Registration received. We’ll let you know when its status changes."}
        </p>
        <div className="flex flex-wrap gap-2">
          {isConfirmed && ticketDownloadUrl ? (
            <Button asChild variant="primary" size="sm">
              <a href={ticketDownloadUrl} download>
                <Download aria-hidden className="size-4" />
                Download and save ticket
              </a>
            </Button>
          ) : null}
          {isConfirmed && href ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={href}>View ticket</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const questions = fields.length > 0 ? (
    <div className="flex flex-col gap-3.5">
      {fields.map((field) => (
        <QuestionField key={field.key} field={field} value={answers[field.key]} onChange={(value) => setAnswer(field.key, value)} />
      ))}
    </div>
  ) : null;

  if (session?.user) {
    return (
      <div className="flex flex-col gap-3.5">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Field label="Name" optional={!requireName} required={requireName} helperText={!requireName ? `Leave blank to use ${session.user.name}.` : undefined}>
          <Input name="name" autoComplete="name" value={name} placeholder={session.user.name ?? ""} onChange={(event) => setName(event.target.value)} maxLength={200} />
        </Field>
        {questions}
        <Button
          variant="accent"
          size="lg"
          fullWidth
          loading={pending}
          loadingLabel="Registering…"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await postRsvp({
                orgSlug,
                ...(eventInstanceId ? { eventInstanceId } : { eventSlug: eventSlug! }),
                name,
                answers,
              });
              if (!res.ok) setError(res.error);
              else saveSuccessfulRsvp({ ticketToken: res.ticketToken, status: res.status });
            });
          }}
        >
          Register
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await postRsvp({
            orgSlug,
            ...(eventInstanceId ? { eventInstanceId } : { eventSlug: eventSlug! }),
            guestEmail,
            name,
            answers,
          });
          if (!res.ok) setError(res.error);
          else saveSuccessfulRsvp({ ticketToken: res.ticketToken, status: res.status });
        });
      }}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <p className="text-body-ui text-ink-muted">Register with your email</p>
      <Field label="Name" required>
        <Input name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
      </Field>
      <Field label="Email" required helperText="We’ll send your ticket here.">
        <Input name="guestEmail" type="email" autoComplete="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
      </Field>
      {questions}
      <Button variant="accent" size="lg" fullWidth type="submit" loading={pending} loadingLabel="Registering…">
        Register
      </Button>
    </form>
  );
}
