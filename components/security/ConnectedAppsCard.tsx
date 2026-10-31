"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { AccountCard } from "@/components/account/AccountCard";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { disconnectOAuthApp } from "@/app/actions/oauth";

export type ConnectedApp = { id: string; name: string; access: string[]; grantedAt: string };

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

/** Apps the person allowed to sign in with Yuyu (docs/OIDC_PROVIDER.md), each with Disconnect. */
export function ConnectedAppsCard({ apps }: { apps: ConnectedApp[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<ConnectedApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <AccountCard
        id="connected-apps"
        title="Connected apps"
        description="Apps you allowed to sign you in with Yuyu. Disconnecting signs you out of the app; it asks again next time."
      >
        <div className="flex flex-col gap-3">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          {apps.length === 0 ? (
            <p className="text-body-ui text-ink-muted">No apps are connected.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {apps.map((app) => (
                <li key={app.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <AppWindow aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{app.name}</p>
                      <p className="text-body-ui text-ink-muted">
                        {app.access.join(" · ")} · Connected {dateFormat.format(new Date(app.grantedAt))}
                      </p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" disabled={pending} onClick={() => setConfirming(app)} className="self-start sm:self-auto">
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AccountCard>
      <ConfirmationDialog
        open={confirming !== null}
        title={`Disconnect ${confirming?.name ?? "this app"}?`}
        message="You will be signed out of the app. To use it again, sign in with Yuyu and allow it once more."
        confirmLabel="Disconnect"
        loading={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const app = confirming;
          setConfirming(null);
          if (!app) return;
          startTransition(async () => {
            setError(null);
            try {
              const result = await disconnectOAuthApp({ grantId: app.id });
              if (!result.ok) setError(result.error);
              else router.refresh();
            } catch {
              setError("Security settings are temporarily unavailable. Please try again.");
            }
          });
        }}
      />
    </>
  );
}
