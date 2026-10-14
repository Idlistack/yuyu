"use client";

import { DotLoader } from "@/components/brand/DotLoader";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BroadcastAttendanceFilter, RsvpStatus } from "@prisma/client";
import { FlaskConical, Monitor, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, Radio, RadioGroup, SegmentedControl } from "@/components/ui/choice";
import { Callout, Card } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <div className="flex flex-col gap-6">
      <Callout tone="info">
        Emails go only to people who already registered for this event. Messages are queued and delivered in the background, a few at a time, so large audiences take a few minutes. Send yourself a test first.
      </Callout>

      <Card className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex-1">
          <h2 className="text-title text-ink">Start from a template</h2>
          <p className="mt-1 text-body-ui text-ink-muted">
            Reminders, agenda updates, speaker news, logistics, thank-yous, and more. Each one fills in the subject, message, and a suggested audience; everything stays editable.
          </p>
        </div>
        <div className="flex w-full flex-col gap-1.5 md:w-[300px]">
          <label id="broadcast-template-label" className="text-label text-ink">Template</label>
          <Select value={templateId} onValueChange={applyTemplate} disabled={pending}>
            <SelectTrigger aria-labelledby="broadcast-template-label">
              <SelectValue placeholder="Custom (from a previous email)" />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_GROUPS.map((group) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {BROADCAST_STARTER_TEMPLATES.filter((template) => template.group === group).map((template) => (
                    <SelectItem key={template.id} value={template.id} description={template.description}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="flex flex-col gap-5">
          <h2 className="text-title text-ink">Who receives it</h2>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-label text-ink">Registration status</legend>
            {BROADCAST_STATUS_OPTIONS.map((option) => (
              <CheckboxField
                key={option.value}
                checked={statuses.includes(option.value)}
                onCheckedChange={() => toggleStatus(option.value)}
                disabled={pending}
                label={<><strong className="font-semibold">{option.label}</strong> <span className="text-ink-muted">— {option.hint}</span></>}
              />
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label text-ink">Attendance</legend>
            <RadioGroup value={attendance} onValueChange={(value) => setAttendance(value as BroadcastAttendanceFilter)} aria-label="Attendance">
              {BROADCAST_ATTENDANCE_OPTIONS.map((option) => (
                <Radio key={option.value} value={option.value} label={option.label} disabled={pending} />
              ))}
            </RadioGroup>
          </fieldset>
          <div aria-live="polite" className="border-t border-line pt-4">
            {countError ? <Callout tone="danger">{countError}</Callout> : (
              <p className="text-body-ui text-ink">
                {recipientCount === null ? "Counting recipients…" : (
                  <>
                    <strong className="font-display text-xl font-extrabold">{recipientCount}</strong> {recipientCount === 1 ? "person" : "people"} will receive this ({audienceText}).
                  </>
                )}
              </p>
            )}
            <p className="mt-1 text-caption text-ink-muted">One email per address, even if someone registered twice.</p>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="text-title text-ink">Message</h2>
          <Field label="Subject" required helperText={`${subject.length}/${BROADCAST_SUBJECT_MAX}`}>
            <Input ref={subjectRef} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={pending} maxLength={BROADCAST_SUBJECT_MAX} />
          </Field>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-ink-muted">Subject placeholders:</span>
            {SUBJECT_PLACEHOLDERS.map((placeholder) => (
              <Tooltip key={placeholder.token} content={placeholder.description}>
                <button
                  type="button"
                  onClick={() => insertSubjectPlaceholder(placeholder.token)}
                  disabled={pending}
                  className="inline-flex min-h-8 items-center rounded-full border border-line-strong bg-canvas px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-subtle disabled:pointer-events-none disabled:opacity-50"
                >
                  {placeholder.label}
                </button>
              </Tooltip>
            ))}
          </div>
          <BroadcastEmailEditor value={body} onChange={setBody} disabled={pending} />
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-title text-ink">Preview</h2>
            <p className="mt-1 max-w-[640px] text-caption text-ink-muted">
              Rendered by the server with example values, exactly as it will arrive. Each attendee sees their own name and, when confirmed, their own ticket link.
            </p>
          </div>
          <SegmentedControl
            ariaLabel="Preview width"
            size="sm"
            value={previewWidth}
            onValueChange={setPreviewWidth}
            options={[
              { value: "desktop", label: "Desktop", icon: <Monitor aria-hidden />, ariaLabel: "Desktop width" },
              { value: "mobile", label: "Mobile", icon: <Smartphone aria-hidden />, ariaLabel: "Mobile width" },
            ]}
          />
        </div>
        {!hasContent ? (
          <Callout tone="info">Add a subject and a message to see the preview.</Callout>
        ) : preview.error && previewReady ? (
          <Callout tone="danger">{preview.error}</Callout>
        ) : (
          <div className="relative flex justify-center rounded-lg bg-muted p-2 sm:p-4">
            {!previewReady ? (
              <div aria-live="polite" className="absolute right-3 top-3 flex items-center gap-2 text-caption text-ink-secondary">
                <DotLoader size={16} label="Updating preview" /> Updating…
              </div>
            ) : null}
            <div className="w-full max-w-[720px] transition-[width] duration-200" style={{ width: previewWidth === "mobile" ? 390 : "100%" }}>
              <p className="px-1 pb-2 text-label text-ink-muted">
                Subject: <span className="font-bold text-ink">{preview.subject || "…"}</span>
              </p>
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={preview.html}
                className="h-[620px] w-full rounded-lg border border-line bg-[#f8f9fa] transition-opacity duration-200"
                style={{ opacity: previewReady ? 1 : 0.6 }}
              />
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          startIcon={<FlaskConical />}
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
        <Button variant="primary" startIcon={<Send />} disabled={!canSend} onClick={() => setConfirmOpen(true)}>
          {recipientCount && recipientCount > 0 ? `Send to ${recipientCount} ${recipientCount === 1 ? "person" : "people"}` : "Send"}
        </Button>
      </div>

      <ConfirmationDialog
        open={confirmOpen}
        title="Send this email?"
        message={`“${preview.subject || subject}” will be queued for ${recipientCount ?? 0} ${recipientCount === 1 ? "person" : "people"} (${audienceText}). This cannot be recalled once delivery starts.`}
        confirmLabel="Send email"
        destructive={false}
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

      <section aria-labelledby="broadcast-history" className="flex flex-col gap-3">
        <h2 id="broadcast-history" className="text-h4 text-ink">Previously sent</h2>
        {history.length === 0 ? (
          <Card>
            <p className="text-body-ui text-ink-muted">No emails have been sent for this event yet.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((row) => (
              <li key={row.id}>
                <Card padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold text-ink">{row.subject}</p>
                    <p className="text-sm text-ink-muted">
                      {new Date(row.createdAt).toLocaleString()} · {row.recipientCount} {row.recipientCount === 1 ? "recipient" : "recipients"} · {describeBroadcastAudience(row.statuses, row.attendance)}
                      {row.createdByName ? ` · by ${row.createdByName}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-ink-secondary">{broadcastHtmlToText(row.body)}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => loadFromHistory(row)} disabled={pending} className="shrink-0">
                    Reuse
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
