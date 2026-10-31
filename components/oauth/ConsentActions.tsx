"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { approveOAuthConsent, denyOAuthConsent } from "@/app/actions/oauth";

/** Allow / Cancel for the one-time authorisation screen. The server decides where to go next. */
export function ConsentActions({ query }: { query: string }) {
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(allow: boolean) {
    setChoice(allow ? "allow" : "deny");
    setError(null);
    startTransition(async () => {
      try {
        const result = allow ? await approveOAuthConsent(query) : await denyOAuthConsent(query);
        if (!result.ok || !result.data) {
          setError(result.ok ? "Something went wrong. Please try again." : result.error);
          return;
        }
        window.location.assign(result.data.redirectTo);
      } catch {
        setError("Yuyu is temporarily unavailable. Please try again.");
      }
    });
  }

  const busy = pending || (choice !== null && !error);
  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" disabled={busy} loading={busy && choice === "deny"} loadingLabel="Cancelling…" onClick={() => decide(false)}>
          Cancel
        </Button>
        <Button variant="primary" size="lg" disabled={busy} loading={busy && choice === "allow"} loadingLabel="Continuing…" onClick={() => decide(true)}>
          Allow
        </Button>
      </div>
    </div>
  );
}
