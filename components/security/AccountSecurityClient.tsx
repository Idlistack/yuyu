"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import QRCode from "react-qr-code";
import type { ReactNode } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, SettingsRow } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  revokeAllSessions,
} from "@/app/actions/security";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";

export function AccountSecurityClient(props: {
  mfaEnabled: boolean;
  /** Rendered between two-step sign-in and signed-in devices. */
  passwordSection?: ReactNode;
}) {
  const [enabled, setEnabled] = useState(props.mfaEnabled);
  const [enrollment, setEnrollment] = useState<{
    secret: string;
    uri: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState<"mfa" | "sessions" | null>(
    null,
  );
  const run = (task: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try { await task(); }
      catch { setError("Security settings are temporarily unavailable. Please try again."); }
    });

  const startEnrollment = () =>
    run(async () => {
      const result = await beginMfaEnrollment();
      if (!result.ok || !result.data)
        setError(
          result.ok ? "Could not start MFA setup." : result.error,
        );
      else setEnrollment(result.data);
    });

  return (
    <div className="flex flex-col">
      {error ? <Callout tone="danger" role="alert" className="mb-4">{error}</Callout> : null}
      {message ? <Callout tone="success" role="status" className="mb-4">{message}</Callout> : null}

      <section aria-labelledby="mfa-title" className="flex flex-col gap-4 pb-2">
        {!enabled ? (
          <div className="flex flex-col gap-4 rounded-xl bg-warning-bg p-5 text-warning-fg sm:flex-row sm:items-center">
            <ShieldAlert aria-hidden className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="mfa-title" className="font-sans text-[17px] font-bold">Two-step sign-in is off</h2>
              <p className="mt-0.5 text-body-ui">Add an authenticator app so a stolen password isn’t enough. Google sign-in follows your Google security.</p>
            </div>
            {!enrollment ? (
              <Button variant="primary" className="shrink-0" disabled={pending} onClick={startEnrollment}>
                Set up authenticator
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-start gap-4 rounded-xl bg-success-bg p-5 text-success-fg">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="mfa-title" className="font-sans text-[17px] font-bold">Two-step sign-in is on</h2>
              <p className="mt-0.5 text-body-ui">Password sign-in needs a six-digit authenticator code. Google sign-in follows your Google security.</p>
            </div>
          </div>
        )}

        {recoveryCodes.length > 0 ? (
          <Callout tone="warning" title="Save these one-time recovery codes now.">
            <pre className="my-2 whitespace-pre-wrap font-mono text-sm">{recoveryCodes.join("\n")}</pre>
            <Button size="sm" variant="secondary" onClick={() => void signOut({ callbackUrl: "/login" })}>
              I saved them — sign in again
            </Button>
          </Callout>
        ) : null}

        {enrollment ? (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-canvas p-5 sm:flex-row sm:items-start">
            <div className="w-fit rounded-md bg-white p-3">
              <QRCode value={enrollment.uri} size={180} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="break-all text-sm text-ink-secondary">
                Manual key: <span className="font-mono text-ink">{enrollment.secret}</span>
              </p>
              <Field label="Six-digit code">
                <Input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" />
              </Field>
              <Button
                variant="primary"
                className="self-start"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const result = await confirmMfaEnrollment({ code });
                    if (!result.ok || !result.data)
                      setError(
                        result.ok ? "Could not enable MFA." : result.error,
                      );
                    else {
                      setEnabled(true);
                      setEnrollment(null);
                      setRecoveryCodes(result.data.recoveryCodes);
                      setCode("");
                    }
                  })
                }
              >
                Verify and enable
              </Button>
            </div>
          </div>
        ) : null}

        {enabled && recoveryCodes.length === 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Authenticator or recovery code" className="sm:w-72">
              <Input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" />
            </Field>
            <Button variant="dangerQuiet" disabled={pending || !code.trim()} onClick={() => setConfirmation("mfa")}>
              Disable MFA
            </Button>
          </div>
        ) : null}
      </section>

      {props.passwordSection}

      <SettingsRow title="Signed-in devices" description="Revoke every issued session, including this browser. You will need to sign in again.">
        <Button variant="danger" disabled={pending} onClick={() => setConfirmation("sessions")}>
          Revoke all sessions
        </Button>
      </SettingsRow>
      <ConfirmationDialog
        open={confirmation === "mfa"}
        title="Disable multi-factor authentication?"
        message="Password sign-in will no longer require an authenticator code. You will be signed out on success."
        confirmLabel="Disable MFA"
        loading={pending}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          setConfirmation(null);
          run(async () => {
            const result = await disableMfa({ code });
            if (!result.ok) setError(result.error);
            else {
              setEnabled(false);
              setCode("");
              await signOut({ callbackUrl: "/login" });
            }
          });
        }}
      />
      <ConfirmationDialog
        open={confirmation === "sessions"}
        title="Revoke all sessions?"
        message="Every signed-in browser and device, including this one, will be signed out immediately."
        confirmLabel="Revoke sessions"
        loading={pending}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          setConfirmation(null);
          run(async () => {
            const result = await revokeAllSessions();
            if (!result.ok) setError(result.error);
            else await signOut({ callbackUrl: "/login" });
          });
        }}
      />
    </div>
  );
}
