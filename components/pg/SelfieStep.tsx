"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ImageUp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Card, Chip } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { attestUnder18, requestSelfieUpload, stopFaceMatching } from "@/app/actions/face-matching";
import { FACE_NOTICE, FACE_NOTICE_VERSION } from "@/lib/pgIntegration/faceNotice";
import { prepareSelfie, SELFIE_ACCEPT, uploadSelfieToPg, type PgUploadOutcome } from "@/components/pg/selfieClient";
import type { FaceMatchingState } from "@/lib/pgIntegration/selfie";

/*
 * The optional selfie step (docs/PG_INTEGRATION.md#selfie-step). The image
 * goes from this browser straight to People's Gallery with a 10-minute
 * ticket; it is never sent to Yuyu (decision D-Selfie). Checks here are for
 * the person's convenience only; People's Gallery decides.
 */

type View = "summary" | "consent" | "capture";

const REJECT_COPY: Record<string, string> = {
  no_face: "We couldn't find a face in that photo.",
  multiple_faces: "That photo has more than one face. Use a photo of just you.",
  face_too_small: "Your face is too small in that photo. Move closer.",
  low_quality: "That photo is too dark or blurry.",
  unreadable: "That file couldn't be read as a photo.",
};

export function SelfieStep({ rsvpId, eventTitle, initial }: { rsvpId: string; eventTitle: string; initial: FaceMatchingState }) {
  const router = useRouter();
  const headingId = useId();
  const [state, setState] = useState(initial);
  const [view, setView] = useState<View>("summary");
  const [consent, setConsent] = useState(false);
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmStop, setConfirmStop] = useState(false);

  if (state.ageAttestation === "MINOR") {
    return (
      <Card as="section" aria-labelledby={headingId}>
        <h2 id={headingId} className="text-heading-s text-ink">Photos by People&apos;s Gallery</h2>
        <p className="mt-2 text-[15px] text-ink-secondary">
          Face matching is only for people aged 18 or older, so it is off for this registration. Your registration is not affected.
        </p>
      </Card>
    );
  }

  const added = state.selfieState === "ADDED" && state.active;
  const needsConsent = !state.active;

  function stop() {
    setError(null);
    startTransition(async () => {
      const result = await stopFaceMatching({ rsvpId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState({ ...state, active: false, withdrawn: true, selfieState: "REMOVED" });
      setConfirmStop(false);
      setStatus("Face matching stopped. People's Gallery deletes your selfie and your matches.");
      router.refresh();
    });
  }

  function under18() {
    setError(null);
    startTransition(async () => {
      const result = await attestUnder18({ rsvpId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState({ ...state, ageAttestation: "MINOR", active: false, selfieState: "NONE" });
    });
  }

  function onUploaded(outcome: PgUploadOutcome) {
    if (outcome.state === "rejected") {
      setState({ ...state, active: true, selfieState: state.selfieState === "ADDED" ? "ADDED" : "REJECTED", rejectedReason: outcome.reason ?? null });
      setError(REJECT_COPY[outcome.reason] ?? "People's Gallery couldn't use that photo. Try another one.");
      return;
    }
    setState({ ...state, active: true, withdrawn: false, needsNewConsent: false, selfieState: "ADDED", rejectedReason: null });
    setView("summary");
    setStatus("Selfie added. We'll email you when People's Gallery has photos of you.");
    router.refresh();
  }

  return (
    <Card as="section" id="find-your-photos" aria-labelledby={headingId} className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-heading-s text-ink">Find your photos</h2>
        {added ? <Chip tone="success" icon={<Check />}>Selfie added</Chip> : null}
      </div>
      <p className="text-[15px] text-ink-secondary">{FACE_NOTICE.summary}</p>

      <div aria-live="polite" className="contents">
        {status ? <Callout tone="success" role="status">{status}</Callout> : null}
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      </div>

      {view === "summary" ? (
        <div className="flex flex-col gap-3">
          {state.selfieState === "REJECTED" && state.active && !error ? (
            <Callout tone="warning">{REJECT_COPY[state.rejectedReason ?? ""] ?? "People's Gallery couldn't use your last photo."} Try another one.</Callout>
          ) : null}
          {state.needsNewConsent ? <Callout tone="info">The face-matching notice changed. Please read it again before your next selfie.</Callout> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant={added ? "secondary" : "primary"} onClick={() => { setError(null); setStatus(null); setView(needsConsent || state.needsNewConsent ? "consent" : "capture"); }}>
              <Camera aria-hidden className="size-4" />
              {added ? "Update selfie" : "Add a selfie"}
            </Button>
            {state.active ? (
              <Button variant="dangerQuiet" onClick={() => setConfirmStop(true)} disabled={pending}>Stop face matching</Button>
            ) : null}
          </div>
          <p className="text-sm text-ink-muted">Optional. Your registration for {eventTitle} works the same without it.</p>
        </div>
      ) : null}

      {view === "consent" ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-[15px] font-bold text-ink">{FACE_NOTICE.title}</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-secondary">
            {FACE_NOTICE.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
          <CheckboxField label={FACE_NOTICE.consentLabel} checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
          <CheckboxField label={FACE_NOTICE.ageLabel} checked={adult} onCheckedChange={(value) => setAdult(value === true)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!consent || !adult} onClick={() => setView("capture")}>
              <ShieldCheck aria-hidden className="size-4" />
              Agree and continue
            </Button>
            <Button variant="quiet" onClick={() => setView("summary")}>Not now</Button>
            <Button variant="quiet" onClick={under18} disabled={pending}>I&apos;m under 18</Button>
          </div>
        </div>
      ) : null}

      {view === "capture" ? (
        <SelfieCapture
          onCancel={() => setView("summary")}
          onError={setError}
          onUploaded={onUploaded}
          requestTicket={async () => {
            const result = await requestSelfieUpload({ rsvpId, noticeVersion: FACE_NOTICE_VERSION, consent: true, adult: true });
            if (!result.ok) throw new Error(result.error);
            return result.data!;
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmStop}
        onCancel={() => setConfirmStop(false)}
        title="Stop face matching?"
        message="People's Gallery deletes your selfie and the photos matched to you for this event. You can add a selfie again later."
        confirmLabel="Stop face matching"
        loading={pending}
        onConfirm={stop}
      />
    </Card>
  );
}

function SelfieCapture({ requestTicket, onUploaded, onError, onCancel }: {
  requestTicket: () => Promise<{ ticket: string; uploadUrl: string }>;
  onUploaded: (outcome: PgUploadOutcome) => void;
  onError: (message: string | null) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  async function startCamera() {
    onError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      onError("This browser can't open the camera here. Choose a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      onError("Camera access was blocked. Allow it in your browser, or choose a photo instead.");
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    stopCamera();
    if (blob) await accept(blob);
  }

  async function accept(input: Blob) {
    onError(null);
    const prepared = await prepareSelfie(input);
    if (!prepared.ok) {
      onError(prepared.error);
      return;
    }
    setPhoto({ blob: prepared.blob, url: URL.createObjectURL(prepared.blob) });
  }

  async function upload() {
    if (!photo) return;
    setBusy(true);
    onError(null);
    try {
      const { ticket, uploadUrl } = await requestTicket();
      onUploaded(await uploadSelfieToPg(uploadUrl, ticket, photo.blob));
    } catch (error) {
      onError(error instanceof Error && error.message ? error.message : "The upload didn't finish. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, never uploaded to Yuyu
        <img src={photo.url} alt="Your selfie preview" className="mx-auto aspect-[3/4] w-full max-w-[280px] rounded-xl object-cover" />
      ) : (
        <div className={cameraOn ? "relative mx-auto w-full max-w-[280px]" : "hidden"}>
          <video ref={videoRef} playsInline muted aria-label="Camera preview" className="aspect-[3/4] w-full -scale-x-100 rounded-xl bg-ink object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-[12%_18%] rounded-[50%] border-2 border-dashed border-white/80" />
        </div>
      )}
      <p className="text-sm text-ink-muted">Just you, facing the camera, in good light. No sunglasses.</p>
      <input ref={fileRef} type="file" accept={SELFIE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void accept(file);
      }} />
      <div className="flex flex-wrap gap-2">
        {photo ? (
          <>
            <Button variant="primary" onClick={upload} disabled={busy} aria-busy={busy}>
              <ImageUp aria-hidden className="size-4" />
              {busy ? "Sending to People's Gallery…" : "Use this photo"}
            </Button>
            <Button variant="quiet" onClick={() => setPhoto(null)} disabled={busy}>Retake</Button>
          </>
        ) : cameraOn ? (
          <>
            <Button variant="primary" onClick={capture}><Camera aria-hidden className="size-4" />Take photo</Button>
            <Button variant="quiet" onClick={stopCamera}>Close camera</Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={startCamera}><Camera aria-hidden className="size-4" />Open camera</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><ImageUp aria-hidden className="size-4" />Choose a photo</Button>
          </>
        )}
        <Button variant="quiet" onClick={() => { stopCamera(); onCancel(); }} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
