"use client";

import { EventPermission } from "@prisma/client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Avatar, Card } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { useRouter } from "next/navigation";
import {
  createEventCollaboratorInvite,
  revokeEventCollaborator,
  updateEventCollaboratorPermissions,
} from "@/app/actions/event-collaborators";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";

const options: Array<[EventPermission, string]> = [
  ["EDIT_DETAILS", "Edit event details"],
  ["MANAGE_REGISTRATIONS", "Manage registrations"],
  ["MANAGE_INVITATIONS", "Manage attendee invites"],
  ["CHECK_IN", "Operate check-in"],
  ["PUBLISH_AND_SCHEDULE", "Publish and manage schedule"],
];
type Collaborator = {
  id: string;
  name: string | null;
  email: string | null;
  permissions: EventPermission[];
};
type PendingInvite = { id: string; email: string; expiresAt: string };

function PermissionCheckboxes({
  selected,
  onChange,
}: {
  selected: EventPermission[];
  onChange: (permissions: EventPermission[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {options.map(([permission, label]) => (
        <CheckboxField
          key={permission}
          label={label}
          checked={selected.includes(permission)}
          onCheckedChange={(checked) =>
            onChange(
              checked === true
                ? [...selected, permission]
                : selected.filter((value) => value !== permission),
            )
          }
        />
      ))}
    </div>
  );
}

export function CollaboratorInvitePanel({
  organisationSlug,
  eventId,
  collaborators,
  pendingInvites,
}: {
  organisationSlug: string;
  eventId: string;
  collaborators: Collaborator[];
  pendingInvites: PendingInvite[];
}) {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<EventPermission[]>(["EDIT_DETAILS"]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedPermissions, setEditedPermissions] = useState<EventPermission[]>(
    [],
  );
  const [pending, startTransition] = useTransition();
  const [revokeTarget, setRevokeTarget] = useState<Collaborator | null>(null);
  const { showToast } = useToast();
  const router = useRouter();
  const refreshAfter = (message: string) => {
    showToast(message, "success");
    router.refresh();
  };
  const invite = () =>
    startTransition(async () => {
      const result = await createEventCollaboratorInvite({
        organisationSlug,
        eventId,
        email,
        permissions: selected,
      });
      if (!result.ok) return showToast(result.error, "error");
      setEmail("");
      refreshAfter("Co-organizer invite email queued");
    });
  const revoke = (collaboratorId: string) =>
    startTransition(async () => {
      const result = await revokeEventCollaborator({
        organisationSlug,
        eventId,
        collaboratorId,
      });
      if (!result.ok) return showToast(result.error, "error");
      setRevokeTarget(null);
      refreshAfter("Co-organizer access removed");
    });
  const savePermissions = (collaboratorId: string) =>
    startTransition(async () => {
      const result = await updateEventCollaboratorPermissions({
        organisationSlug,
        eventId,
        collaboratorId,
        permissions: editedPermissions,
      });
      if (!result.ok) return showToast(result.error, "error");
      setEditingId(null);
      refreshAfter("Co-organizer permissions updated");
    });
  const startEditing = (collaborator: Collaborator) => {
    setEditingId(collaborator.id);
    setEditedPermissions(collaborator.permissions);
  };
  const permissionSummary = (permissions: EventPermission[]) =>
    permissions.map((permission) => options.find(([value]) => value === permission)?.[1] ?? permission).join(" · ");

  return (
    <Card as="section" aria-labelledby="co-organizers-title">
      <h2 id="co-organizers-title" className="text-h4 text-ink">Co-organizers</h2>
      <p className="mt-1 text-body-ui text-ink-muted">
        Invite someone to manage only this event. They do not become an
        organisation member.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        <h3 className="text-label text-ink">Active co-organizers ({collaborators.length})</h3>
        {collaborators.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {collaborators.map((collaborator) => (
              <li key={collaborator.id} className="px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={collaborator.name || collaborator.email} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-ink">{collaborator.name || collaborator.email || "Co-organizer"}</p>
                      {collaborator.name && collaborator.email ? <p className="truncate text-sm text-ink-muted">{collaborator.email}</p> : null}
                      <p className="text-caption text-ink-muted">{permissionSummary(collaborator.permissions)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="quiet" aria-expanded={editingId === collaborator.id} onClick={() => startEditing(collaborator)} disabled={pending}>
                      Edit permissions
                    </Button>
                    <Button size="sm" variant="dangerQuiet" onClick={() => setRevokeTarget(collaborator)} disabled={pending}>
                      Remove
                    </Button>
                  </div>
                </div>
                {editingId === collaborator.id ? (
                  <div className="mt-3 flex flex-col gap-3 rounded-lg bg-subtle p-4">
                    <p className="text-label text-ink">Permissions</p>
                    <PermissionCheckboxes selected={editedPermissions} onChange={setEditedPermissions} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => savePermissions(collaborator.id)} disabled={pending || editedPermissions.length === 0}>
                        Save permissions
                      </Button>
                      <Button size="sm" variant="quiet" onClick={() => setEditingId(null)} disabled={pending}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-ui text-ink-muted">No active co-organizers yet.</p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <h3 className="text-label text-ink">Pending invitations ({pendingInvites.length})</h3>
        {pendingInvites.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {pendingInvites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate text-body-ui text-ink">{invite.email}</span>
                <span className="shrink-0 text-caption text-ink-muted">Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-ui text-ink-muted">No pending invitations.</p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5">
        <h3 className="text-label text-ink">Invite a co-organizer</h3>
        <Field label="Email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <PermissionCheckboxes selected={selected} onChange={setSelected} />
        <Button className="self-start" variant="secondary" disabled={pending || !email || selected.length === 0} onClick={invite}>
          Invite co-organizer
        </Button>
      </div>
      <ConfirmationDialog
        open={Boolean(revokeTarget)}
        title="Remove co-organizer?"
        message={`${revokeTarget?.name || revokeTarget?.email || "This co-organizer"} will immediately lose access to this event.`}
        confirmLabel="Remove access"
        loading={pending}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && revoke(revokeTarget.id)}
      />
    </Card>
  );
}
