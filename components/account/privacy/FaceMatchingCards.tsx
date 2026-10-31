"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card, CardHeader, Chip, EmptyState } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { stopAllFaceMatching, stopFaceMatching, updatePhotoEmailPreference } from "@/app/actions/face-matching";
import { formatDayShort } from "@/lib/format/datetime";

export type FaceMatchingRow = {
  rsvpId: string;
  eventTitle: string;
  startDateTime: string;
  timezone: string;
  ticketPath: string;
  minor: boolean;
  active: boolean;
  selfieState: "NONE" | "PENDING" | "ADDED" | "REJECTED" | "REMOVED";
};

function statusChip(row: FaceMatchingRow) {
  if (row.minor) return <Chip tone="neutral">Off · under 18</Chip>;
  if (!row.active) return <Chip tone="neutral">Stopped</Chip>;
  if (row.selfieState === "ADDED") return <Chip tone="success">Selfie added</Chip>;
  if (row.selfieState === "REJECTED") return <Chip tone="warning">Needs a new selfie</Chip>;
  return <Chip tone="neutral">No selfie yet</Chip>;
}

export function FaceMatchingCard({ rows }: { rows: FaceMatchingRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<{ kind: "one"; rsvpId: string; title: string } | { kind: "all" } | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const anyActive = rows.some((row) => row.active);

  function run() {
    if (!confirm) return;
    startTransition(async () => {
      const result = confirm.kind === "all" ? await stopAllFaceMatching() : await stopFaceMatching({ rsvpId: confirm.rsvpId });
      setConfirm(null);
      if (!result.ok) {
        setMessage({ tone: "danger", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: "Face matching stopped. People's Gallery deletes your selfie and your matches." });
      router.refresh();
    });
  }

  return (
    <Card as="section" className="flex flex-col gap-4">
      <CardHeader
        title="Face matching with People's Gallery"
        description="You add a selfie in Yuyu; only People's Gallery keeps it, for matching you in event photos. Yuyu never keeps a copy."
      />
      <div aria-live="polite">{message ? <Callout tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Callout> : null}</div>
      {rows.length === 0 ? (
        <EmptyState title="No face matching yet">When an event uses People&apos;s Gallery, you can add an optional selfie from your ticket.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.rsvpId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">{row.eventTitle}</p>
                <p className="text-caption text-ink-muted">{formatDayShort(new Date(row.startDateTime), row.timezone)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {statusChip(row)}
                {!row.minor ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`${row.ticketPath}#find-your-photos`}>{row.active && row.selfieState === "ADDED" ? "Update selfie" : "Add a selfie"}</Link>
                  </Button>
                ) : null}
                {row.active ? (
                  <Button variant="dangerQuiet" size="sm" disabled={pending} onClick={() => setConfirm({ kind: "one", rsvpId: row.rsvpId, title: row.eventTitle })}>
                    Stop face matching
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {anyActive ? (
        <div>
          <Button variant="danger" disabled={pending} onClick={() => setConfirm({ kind: "all" })}>Stop face matching everywhere</Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        title={confirm?.kind === "all" ? "Stop face matching for every event?" : "Stop face matching?"}
        message={confirm?.kind === "all"
          ? "People's Gallery deletes all your selfies and the photos matched to you. You can add a selfie again later."
          : `People's Gallery deletes your selfie and the photos matched to you for ${confirm?.kind === "one" ? confirm.title : "this event"}.`}
        confirmLabel="Stop face matching"
        loading={pending}
        onConfirm={run}
      />
    </Card>
  );
}

export function PhotoEmailCard({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Card as="section" className="flex flex-col gap-3">
      <CardHeader title="Photo emails" description="Yuyu sends these on behalf of People's Gallery, which never gets your email address." />
      <SwitchRow
        label="Email me when People's Gallery has photos of me"
        description="For example: “Your 23 photos from Tech4Good Summit are ready”."
        checked={enabled}
        disabled={pending}
        onCheckedChange={(value) => {
          const next = value === true;
          setError(null);
          setEnabled(next);
          startTransition(async () => {
            const result = await updatePhotoEmailPreference({ pgPhotosEmail: next });
            if (!result.ok) {
              setEnabled(!next);
              setError(result.error);
            }
          });
        }}
      />
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
    </Card>
  );
}
