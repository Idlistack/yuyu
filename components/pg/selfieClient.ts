/*
 * Browser-side selfie helpers (docs/PG_INTEGRATION.md#selfie-step). They run
 * only in the attendee's browser: the checks are for convenience (People's
 * Gallery is authoritative), and the upload goes straight to People's Gallery
 * with the enrollment ticket, never to Yuyu (decision D-Selfie).
 */

export const SELFIE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
export const SELFIE_MAX_BYTES = 10 * 1024 * 1024;
export const SELFIE_MIN_SIDE = 480;
export const SELFIE_MAX_SIDE = 1600;
const ALLOWED_TYPES = new Set(SELFIE_ACCEPT.split(","));

export type PreparedSelfie = { ok: true; blob: Blob } | { ok: false; error: string };

/** Type, size and dimension checks; decodable images are re-encoded to a JPEG without metadata (no GPS) and at most 1600 px. */
export async function prepareSelfie(input: Blob, env: { createImageBitmap?: typeof createImageBitmap; document?: Document } = globalThis): Promise<PreparedSelfie> {
  if (!ALLOWED_TYPES.has(input.type)) return { ok: false, error: "Choose a JPEG, PNG, WebP or HEIC photo." };
  if (input.size === 0) return { ok: false, error: "That file is empty." };
  if (input.size > SELFIE_MAX_BYTES) return { ok: false, error: "That photo is larger than 10 MB. Choose a smaller one." };
  if (input.type === "image/heic" || input.type === "image/heif") {
    // Most browsers cannot decode HEIC; People's Gallery checks and re-encodes it.
    return { ok: true, blob: input };
  }
  if (!env.createImageBitmap || !env.document) return { ok: true, blob: input };
  let bitmap: ImageBitmap;
  try {
    bitmap = await env.createImageBitmap(input);
  } catch {
    return { ok: false, error: "That file couldn't be opened as a photo." };
  }
  try {
    if (Math.min(bitmap.width, bitmap.height) < SELFIE_MIN_SIDE) {
      return { ok: false, error: `That photo is too small. Use one at least ${SELFIE_MIN_SIDE} pixels on each side.` };
    }
    const scale = Math.min(1, SELFIE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = env.document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return { ok: true, blob: input };
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return blob ? { ok: true, blob } : { ok: true, blob: input };
  } finally {
    bitmap.close?.();
  }
}

/** Contract v1.2 §4.2: 201 `ready`, or 422 `rejected` with a reason (the ticket is spent either way). */
export type PgUploadOutcome = { enrollmentId: string; state: "ready"; reason?: undefined } | { enrollmentId: null; state: "rejected"; reason: string };

const REJECT_REASONS = new Set(["no_face", "multiple_faces", "face_too_small", "low_quality", "unreadable"]);

const UPLOAD_ERRORS: Record<string, string> = {
  INVALID_TICKET: "The upload link expired. Try again.",
  TICKET_USED: "That upload link was already used. Try again.",
  NOT_ELIGIBLE: "People's Gallery can't accept a selfie for this registration.",
  EVENT_NOT_FOUND: "People's Gallery hasn't received this event yet. Try again in a minute.",
  EVENT_CLOSED: "This event is closed, so selfies can't be added.",
  IMAGE_TOO_LARGE: "That photo is larger than 10 MB. Choose a smaller one.",
  UNSUPPORTED_IMAGE: "Choose a JPEG, PNG, WebP or HEIC photo.",
  FACE_ENGINE_UNAVAILABLE: "People's Gallery can't check photos right now. Try again later.",
  INTEGRATION_DISABLED: "People's Gallery can't take selfies right now. Try again later.",
  RATE_LIMITED: "Too many uploads. Please try again later.",
};

/** POSTs the photo and ticket straight to People's Gallery: no cookies, no referrer. */
export async function uploadSelfieToPg(uploadUrl: string, ticket: string, photo: Blob, fetcher: typeof fetch = fetch): Promise<PgUploadOutcome> {
  const form = new FormData();
  form.set("ticket", ticket);
  form.set("file", photo, photo.type === "image/jpeg" ? "selfie.jpg" : "selfie");
  let response: Response;
  try {
    response = await fetcher(uploadUrl, { method: "POST", body: form, credentials: "omit", mode: "cors", referrerPolicy: "no-referrer", cache: "no-store" });
  } catch {
    throw new Error("Couldn't reach People's Gallery. Check your connection and try again.");
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  // A quality rejection is an answer, not a failure: read state/reason from the body whatever the status.
  if (body?.state === "rejected" && (response.status === 422 || response.ok)) {
    const reason = typeof body.reason === "string" && REJECT_REASONS.has(body.reason) ? body.reason : "unreadable";
    return { enrollmentId: null, state: "rejected", reason };
  }
  if (!response.ok) {
    const code = body && typeof body.error === "object" && body.error ? (body.error as Record<string, unknown>).code : null;
    throw new Error((typeof code === "string" && UPLOAD_ERRORS[code]) || "People's Gallery couldn't take the photo. Try again.");
  }
  // Older PG builds may still say "processing"; both mean the selfie was accepted.
  if (typeof body?.enrollmentId !== "string" || (body.state !== "ready" && body.state !== "processing")) {
    throw new Error("People's Gallery sent an unexpected answer. Try again.");
  }
  return { enrollmentId: body.enrollmentId, state: "ready" };
}
