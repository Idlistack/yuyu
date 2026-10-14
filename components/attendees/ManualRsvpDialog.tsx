"use client";

import { useState, useTransition } from "react";
import type { RegistrationFieldType } from "@prisma/client";
import { UserPlus } from "lucide-react";
import { AttendeeAnswerField } from "@/components/attendees/AttendeeAnswerField";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { addManualRsvp } from "@/app/actions/rsvp-admin";
import { useToast } from "@/components/feedback/ToastProvider";

export type ManualRsvpField = {
  id: string;
  key: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  options: string[];
};

export function ManualRsvpDialog(props: {
  organisationSlug: string;
  eventId: string;
  fields: ManualRsvpField[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { organisationSlug, eventId, fields, onClose, onAdded } = props;
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  const setAnswer = (key: string, value: unknown) => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !pending) onClose(); }}>
      <DialogContent size="md">
      <form className="flex min-h-0 flex-col" onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await addManualRsvp({
            organisationSlug,
            eventId,
            name,
            guestEmail: email,
            answers,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          const status = result.data!.status === "CONFIRMED" ? "confirmed" : result.data!.status.toLowerCase().replace(/_/g, " ");
          showToast(`Attendee added — ${status}. A ticket email has been queued.`, "success");
          onAdded();
          onClose();
        });
      }}>
        <DialogHeader title="Add attendee" description="Add a guest RSVP and send their ticket confirmation. Capacity and event registration rules still apply." />
        <DialogBody className="flex flex-col gap-4">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          <Field label="Name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </Field>
          <Field label="Email" required>
            <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          {fields.map((field) => <AttendeeAnswerField key={field.key} field={field} value={answers[field.key]} onChange={(value) => setAnswer(field.key, value)} />)}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" startIcon={<UserPlus />} loading={pending}>
            Add attendee
          </Button>
        </DialogFooter>
      </form>
      </DialogContent>
    </Dialog>
  );
}
