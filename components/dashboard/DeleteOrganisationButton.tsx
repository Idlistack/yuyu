"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOrganisation } from "@/app/actions/membership";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function DeleteOrganisationButton(props: {
  organisationSlug: string;
}) {
  const { organisationSlug } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete organisation
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete organisation?"
        message="All events, RSVPs, and memberships for this organisation will be permanently removed."
        confirmLabel="Delete"
        loading={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const res = await deleteOrganisation({ organisationSlug });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            setOpen(false);
            showToast("Organisation deleted", "success");
            router.push("/dashboard");
          });
        }}
      />
    </>
  );
}
