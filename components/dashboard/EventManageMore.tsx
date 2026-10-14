"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventClientDto } from "@/lib/eventDto";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip, DangerZone } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { cloneEvent, deleteEvent, updateEventSlug } from "@/app/actions/event";
import { useToast } from "@/components/feedback/ToastProvider";

function originFromWindow() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for older browsers.
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

export function EventManageMore(props: {
  organisationSlug: string;
  event: EventClientDto;
}) {
  const { organisationSlug, event } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  const [slug, setSlug] = useState(event.slug);
  const [confirmText, setConfirmText] = useState("");

  const publicUrl = useMemo(() => {
    const o = originFromWindow();
    const path = `/${organisationSlug}/${slug}`;
    return o ? `${o}${path}` : path;
  }, [organisationSlug, slug]);

  const embedButtonSnippet = useMemo(() => {
    const label = `Register for ${event.title}`;
    return `<a href="${publicUrl}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${label} (opens in a new tab)`)}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#ffffff;color:#111111;text-decoration:none;font-family:system-ui;font-weight:600;">${escapeHtml(label)}</a>`;
  }, [event.title, publicUrl]);

  const embedPageSnippet = useMemo(() => {
    const embedUrl = `${originFromWindow()}/embed/${organisationSlug}/${slug}`;
    return `<iframe src="${embedUrl}" title="${escapeHtml(`${event.title} registration`)}" style="width:100%;height:720px;border:1px solid rgba(255,255,255,0.12);border-radius:16px;overflow:hidden;"></iframe>`;
  }, [event.title, organisationSlug, slug]);

  const doUpdateSlug = () => {
    startTransition(async () => {
      const res = await updateEventSlug({
        organisationSlug,
        eventId: event.id,
        slug,
      });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      showToast("Event URL updated", "success");
      router.refresh();
    });
  };

  const doClone = () => {
    startTransition(async () => {
      const res = await cloneEvent({ organisationSlug, eventId: event.id });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      showToast("Event cloned", "success");
      router.push(`/dashboard/${organisationSlug}/event/${res.data!.eventId}`);
    });
  };

  const doDelete = () => {
    startTransition(async () => {
      const res = await deleteEvent({ organisationSlug, eventId: event.id });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      showToast("Event cancelled", "success");
      router.push(`/dashboard/${organisationSlug}`);
      router.refresh();
    });
  };

  const copySnippet = (value: string) => {
    void copyToClipboard(value).then(() => showToast("Copied embed snippet", "success"));
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Clone event"
          description="Create a new event with the same information as this one. RSVP guest list and invites won’t be copied."
          className="mb-3"
        />
        <Button variant="primary" onClick={doClone} disabled={pending}>
          Clone event
        </Button>
      </Card>

      <Card>
        <CardHeader
          title="Event page"
          description="Change your public URL. If you’ve already shared the old link, it may stop working."
          className="mb-3"
        />
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
          <Field label="Public URL slug" helperText="lowercase letters, numbers, hyphens" className="flex-1">
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={pending} />
          </Field>
          <div className="flex gap-2 sm:pt-[26px]">
            <Button variant="secondary" onClick={doUpdateSlug} disabled={pending || slug.trim() === event.slug}>
              Update
            </Button>
            <Button
              variant="secondary"
              startIcon={<Copy />}
              onClick={() => {
                void copyToClipboard(publicUrl).then(() => {
                  showToast("Copied URL", "success");
                });
              }}
              disabled={pending}
            >
              Copy
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip size="sm" tone="outline">Public URL</Chip>
          <code className="break-all font-mono text-sm text-ink-secondary">{publicUrl}</code>
        </div>
      </Card>

      <Card>
        <CardHeader title="Embed event" description="Add a button or an embedded page to your website." className="mb-3" />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-label text-ink">Add a registration button</h3>
                <p className="text-sm text-ink-muted">Shows “Register for {event.title}” and opens the event page in a new tab.</p>
              </div>
              <Button size="sm" variant="secondary" startIcon={<Copy />} onClick={() => copySnippet(embedButtonSnippet)}>
                Copy registration button
              </Button>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-line bg-subtle p-3 font-mono text-xs text-ink-secondary">{embedButtonSnippet}</pre>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-label text-ink">Embed event page</h3>
              <Button size="sm" variant="secondary" startIcon={<Copy />} onClick={() => copySnippet(embedPageSnippet)}>
                Copy snippet
              </Button>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-line bg-subtle p-3 font-mono text-xs text-ink-secondary">{embedPageSnippet}</pre>
          </div>
        </div>
      </Card>

      <DangerZone title="Delete event" description="Permanently deletes this event and its registrations. This can’t be undone.">
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <Field label={<>Type <span className="font-mono">{event.slug}</span> to confirm</>} className="flex-1">
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} disabled={pending} autoComplete="off" />
          </Field>
          <Button variant="danger" onClick={doDelete} disabled={pending || confirmText.trim() !== event.slug}>
            Delete event
          </Button>
        </div>
      </DangerZone>
    </div>
  );
}
