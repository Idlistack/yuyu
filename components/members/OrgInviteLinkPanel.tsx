"use client";

import { useMemo, useState, useTransition } from "react";
import { Copy, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Chip } from "@/components/ui/display";
import { createOrgInvite, revokeOrgInvite } from "@/app/actions/org-invites";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";

export type OrgInviteRow = {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
};

export function OrgInviteLinkPanel(props: {
  organisationSlug: string;
  baseUrl: string;
  invites: OrgInviteRow[];
}) {
  const { organisationSlug, baseUrl } = props;
  const [invites, setInvites] = useState<OrgInviteRow[]>(props.invites);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const latest = invites[0] ?? null;
  const latestUrl = useMemo(() => {
    if (!latest) return "";
    return `${baseUrl}/join/org/${latest.token}`;
  }, [baseUrl, latest]);

  return (
    <Card as="section" className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h4 text-ink">Invite link</h2>
          <Chip size="sm" tone="outline">Single-use</Chip>
        </div>
        <p className="mt-1 text-body-ui text-ink-muted">
          Generate a one-time link to add someone as a member. Only admins and
          the owner can create links.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <label htmlFor="org-invite-url" className="sr-only">Latest invite URL</label>
          <input
            id="org-invite-url"
            readOnly
            value={latestUrl || "No invite generated yet."}
            className="block w-full truncate rounded-md border border-line bg-subtle px-3.5 py-[11px] font-mono text-sm text-ink-secondary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={!latestUrl || pending}
            startIcon={<Copy />}
            onClick={() => {
              void navigator.clipboard
                .writeText(latestUrl)
                .then(() => showToast("Copied link", "success"))
                .catch(() => showToast("Could not copy link", "error"));
            }}
          >
            Copy link
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            startIcon={<Link2 />}
            onClick={() => {
              startTransition(async () => {
                const res = await createOrgInvite({ organisationSlug });
                if (!res.ok) {
                  showToast(res.error, "error");
                  return;
                }
                const inviteId = (res.data as { inviteId: string }).inviteId;
                const token = (res.data as { token: string }).token;
                const row: OrgInviteRow = {
                  id: inviteId,
                  token,
                  createdAt: new Date().toISOString(),
                  expiresAt: null,
                };
                setInvites((prev) => [row, ...prev]);
                showToast("Invite link generated", "success");
              });
            }}
          >
            Generate link
          </Button>
          {latest ? (
            <Button
              variant="dangerQuiet"
              disabled={pending}
              startIcon={<Trash2 />}
              onClick={() => setConfirmRevoke(true)}
            >
              Revoke latest
            </Button>
          ) : null}
        </div>
      </div>

      <ConfirmationDialog
        open={confirmRevoke}
        title="Revoke invite link?"
        message="Anyone who has this link will no longer be able to use it to join the organisation."
        confirmLabel="Revoke link"
        loading={pending}
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={() => {
          if (!latest) return;
          startTransition(async () => {
            const res = await revokeOrgInvite({
              organisationSlug,
              inviteId: latest.id,
            });
            if (!res.ok) return showToast(res.error, "error");
            setInvites((prev) => prev.filter((x) => x.id !== latest.id));
            setConfirmRevoke(false);
            showToast("Invite revoked", "success");
          });
        }}
      />

      {invites.length > 1 ? (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <p className="text-caption text-ink-muted">Recent unused links</p>
          <ul className="flex flex-col gap-1">
            {invites.slice(1, 6).map((i) => (
              <li key={i.id} className="break-all font-mono text-[13px] text-ink-muted">
                {`${baseUrl}/join/org/${i.token}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
