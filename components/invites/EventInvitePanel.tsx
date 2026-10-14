"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { addEventInvite, removeEventInvite } from "@/app/actions/invites";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";

export function EventInvitePanel(props: {
  organisationSlug: string;
  eventId: string;
  eventHasEnded: boolean;
  invites: { id: string; email: string; createdAt: string }[];
}) {
  const { organisationSlug, eventId, eventHasEnded, invites } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    email: string;
  } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-ui text-ink-muted">
        {eventHasEnded
          ? "This event has ended, so no new invites can be sent."
          : "Required for invite-only events. Emails are matched case-insensitively."}
      </p>
      <form
        className="flex flex-col gap-2.5 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await addEventInvite({
              organisationSlug,
              eventId,
              email,
            });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            setEmail("");
            showToast("Invite added", "success");
            router.refresh();
          });
        }}
      >
        <label htmlFor="event-invite-email" className="sr-only">Email</label>
        <Input
          id="event-invite-email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={eventHasEnded || pending}
        />
        <Button type="submit" variant="primary" disabled={eventHasEnded || pending}>
          Add
        </Button>
      </form>
      {invites.length === 0 ? (
        <EmptyState title="No invites yet." />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-canvas">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-ui font-semibold text-ink">{inv.email}</p>
                <p className="text-caption text-ink-muted">{new Date(inv.createdAt).toLocaleString()}</p>
              </div>
              <IconButton label="Remove" variant="danger" size="sm" disabled={pending} onClick={() => setRemoveTarget(inv)}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <ConfirmationDialog
        open={Boolean(removeTarget)}
        title="Remove event invite?"
        message={`Remove ${removeTarget?.email ?? "this email"} from the event allowlist?`}
        confirmLabel="Remove invite"
        loading={pending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          startTransition(async () => {
            const res = await removeEventInvite({
              organisationSlug,
              eventId,
              inviteId: removeTarget.id,
            });
            if (!res.ok) return showToast(res.error, "error");
            setRemoveTarget(null);
            showToast("Invite removed", "success");
            router.refresh();
          });
        }}
      />
    </div>
  );
}
