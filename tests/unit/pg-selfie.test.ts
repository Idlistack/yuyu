import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

/*
 * People's Gallery P3 contract pieces that need no database
 * (docs/PG_INTEGRATION.md#enrollment-ticket): the enrollment ticket and its
 * shared vector, strict callback and notification bodies, the deep-link
 * origin rule, the attendee copy, and the browser upload client (the image
 * goes to People's Gallery only).
 */

process.env.MFA_ENCRYPTION_KEY ||= Buffer.alloc(32, 5).toString("base64");
vi.mock("@/lib/db", () => ({ prisma: {} }));

import {
  mintEnrollmentTicket,
  newTicketSecret,
  signEnrollmentTicket,
  ticketKey,
  TICKET_TTL_SECONDS,
  verifyEnrollmentTicket,
  type EnrollmentTicketClaims,
} from "@/lib/pgIntegration/enrollmentTicket";
import {
  idempotencyKeySchema,
  pgConsentWithdrawSchema,
  pgDataSchemas,
  pgEnrollmentStatusSchema,
  pgNotificationRequestSchema,
} from "@/lib/pgIntegration/contract";
import { allowedDeepLink, pgPhotosPush, pgPhotosSubject } from "@/lib/pgIntegration/notifications";
import { FACE_NOTICE, FACE_NOTICE_VERSION } from "@/lib/pgIntegration/faceNotice";
import { mobileSelfieTicketBodySchema, selfieTicketInputSchema } from "@/lib/pgIntegration/selfieInput";
import { prepareSelfie, uploadSelfieToPg } from "@/components/pg/selfieClient";
import { buildPgPhotosEmail } from "@/lib/email";
import { asPgPhotosPayload } from "@/lib/outbox";
import { checkPublicUrl, newTicketSecret as cliNewTicketSecret } from "@/scripts/pg-integration";

const SECRET = "whsec_MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
const ISSUER = "https://yuyu.example.org";
const SUBJECT = "q3Zq3Zq3Zq3Zq3Zq3Zq3Zq3Zq3Zq3Zq3Zq3Zq3Zq3Zq";
const CLAIMS: EnrollmentTicketClaims = {
  iss: ISSUER, aud: "peoples-gallery:enrollment", sub: SUBJECT, jti: "yet_00000000000000000000000000000001",
  iat: 1792656000, exp: 1792656600, org: "cmorg123", evt: "cmevent123", occ: null, reg: "cmrsvp1",
  pur: "face_matching", nv: "pg-face-2026-11-v1", age: "adult", act: "add",
};
/** Shared with People's Gallery (contract v1.2 §4.1); computed independently in Python. */
const VECTOR = "eyJhbGciOiJIUzI1NiIsInR5cCI6Inl1eXUtcGctZW5yb2xsK2p3dCJ9."
  + "eyJpc3MiOiJodHRwczovL3l1eXUuZXhhbXBsZS5vcmciLCJhdWQiOiJwZW9wbGVzLWdhbGxlcnk6ZW5yb2xsbWVudCIsInN1YiI6InEzWnEzWnEzWnEzWnEzWnEzWnEzWnEzWnEzWnEzWnEzWnEzWnEzWnEzWnEiLCJqdGkiOiJ5ZXRfMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEiLCJpYXQiOjE3OTI2NTYwMDAsImV4cCI6MTc5MjY1NjYwMCwib3JnIjoiY21vcmcxMjMiLCJldnQiOiJjbWV2ZW50MTIzIiwib2NjIjpudWxsLCJyZWciOiJjbXJzdnAxIiwicHVyIjoiZmFjZV9tYXRjaGluZyIsIm52IjoicGctZmFjZS0yMDI2LTExLXYxIiwiYWdlIjoiYWR1bHQiLCJhY3QiOiJhZGQifQ."
  + "H2Nlb0VugM9GW2w08XXkMwP8SjUTeYOIQrb0ty-2JKA";
/** Key v2 (security review Y-1): dedicated `ytk_` secret, HKDF-SHA256 info "yuyu-pg-enrollment-ticket-v2"; same claims. Computed independently in Python. */
const SECRET_V2 = "ytk_MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
const KEY_V2_HEX = "ea5f3630230c5897bbd5ee13979db1cfe5b993d31a1c882ec938dab2911ded95";
const VECTOR_V2 = VECTOR.slice(0, VECTOR.lastIndexOf(".") + 1) + "0YM9F2mAK78v18VR2xzefwkgKzy64WJ1qgU4GvU1rI8";
const at = (seconds: number) => new Date(seconds * 1000);

function tamper(token: string, part: 0 | 1, edit: (value: Record<string, unknown>) => Record<string, unknown>) {
  const parts = token.split(".");
  parts[part] = Buffer.from(JSON.stringify(edit(JSON.parse(Buffer.from(parts[part]!, "base64url").toString())))).toString("base64url");
  return parts.join(".");
}

describe("enrollment ticket", () => {
  it("signs with a dedicated ticket secret (key v2) that the delivery secret cannot forge", () => {
    expect(ticketKey(SECRET_V2).toString("hex")).toBe(KEY_V2_HEX);
    expect(signEnrollmentTicket(SECRET_V2, CLAIMS)).toBe(VECTOR_V2);
    const options = { issuer: ISSUER, now: at(CLAIMS.iat + 1) };
    expect(verifyEnrollmentTicket(VECTOR_V2, { ...options, secrets: [SECRET_V2] })).toEqual({ ok: true, claims: CLAIMS });
    // Independent keys: a v1 (delivery-secret) ticket fails against the ticket secret and vice versa.
    expect(verifyEnrollmentTicket(VECTOR, { ...options, secrets: [SECRET_V2] })).toEqual({ ok: false, error: "bad_signature" });
    expect(verifyEnrollmentTicket(VECTOR_V2, { ...options, secrets: [SECRET] })).toEqual({ ok: false, error: "bad_signature" });
    // Rotation: a list of ticket secrets.
    expect(verifyEnrollmentTicket(VECTOR_V2, { ...options, secrets: [newTicketSecret(), SECRET_V2] })).toMatchObject({ ok: true });
    expect(newTicketSecret()).toMatch(/^ytk_[A-Za-z0-9_-]{43}$/);
    expect(cliNewTicketSecret()).toMatch(/^ytk_[A-Za-z0-9_-]{43}$/);
  });

  it("puts revoked ticket ids (not tickets) in consent.withdrawn", () => {
    const base = { registrationId: "r", subject: SUBJECT, purpose: "face_matching", scope: "event", withdrawnAt: "2026-11-14T03:30:00.000Z" };
    expect(pgDataSchemas["consent.withdrawn"].safeParse({ ...base, revokedJtis: ["yet_00000000000000000000000000000001"] }).success).toBe(true);
    expect(pgDataSchemas["consent.withdrawn"].safeParse({ ...base, revokedJtis: [VECTOR] }).success).toBe(false);
    expect(pgDataSchemas["consent.withdrawn"].safeParse(base).success).toBe(false);
    expect(pgDataSchemas["consent.withdrawn"].safeParse({ ...base, revokedJtis: Array.from({ length: 101 }, (_, i) => `yet_${i.toString(16).padStart(32, "0")}`) }).success).toBe(false);
  });

  it("matches the vector shared with People's Gallery", () => {
    expect(signEnrollmentTicket(SECRET, CLAIMS)).toBe(VECTOR);
    expect(verifyEnrollmentTicket(VECTOR, { secrets: [SECRET], issuer: ISSUER, now: at(CLAIMS.iat + 1) })).toEqual({ ok: true, claims: CLAIMS });
  });

  it("mints 10-minute tickets with a fresh jti and no contact data", () => {
    const now = new Date("2026-11-14T03:30:00.000Z");
    const first = mintEnrollmentTicket({ secret: SECRET, issuer: ISSUER, subject: SUBJECT, organisationId: "o", eventId: "e", registrationId: "r", noticeVersion: FACE_NOTICE_VERSION, action: "replace", now });
    const second = mintEnrollmentTicket({ secret: SECRET, issuer: ISSUER, subject: SUBJECT, organisationId: "o", eventId: "e", registrationId: "r", noticeVersion: FACE_NOTICE_VERSION, action: "add", now });
    expect(first.claims.exp - first.claims.iat).toBe(TICKET_TTL_SECONDS);
    expect(first.expiresAt.toISOString()).toBe("2026-11-14T03:40:00.000Z");
    expect(first.claims.jti).toMatch(/^yet_[0-9a-f]{32}$/);
    expect(first.claims.jti).not.toBe(second.claims.jti);
    expect(Object.keys(first.claims).sort()).toEqual(["act", "age", "aud", "evt", "exp", "iat", "iss", "jti", "nv", "occ", "org", "pur", "reg", "sub"]);
    expect(() => signEnrollmentTicket(SECRET, { ...CLAIMS, age: "minor" } as unknown as EnrollmentTicketClaims)).toThrow();
  });

  it("rejects every tampered, expired, foreign or replayed ticket", () => {
    const options = { secrets: [SECRET], issuer: ISSUER, now: at(CLAIMS.iat + 30) };
    const resign = (claims: Record<string, unknown>) => signEnrollmentTicket(SECRET, claims as EnrollmentTicketClaims);
    expect(verifyEnrollmentTicket("a.b", options)).toEqual({ ok: false, error: "malformed" });
    expect(verifyEnrollmentTicket(tamper(VECTOR, 0, () => ({ alg: "none", typ: "yuyu-pg-enroll+jwt" })), options)).toEqual({ ok: false, error: "bad_header" });
    expect(verifyEnrollmentTicket(tamper(VECTOR, 0, (header) => ({ ...header, kid: "1" })), options)).toEqual({ ok: false, error: "bad_header" });
    expect(verifyEnrollmentTicket(tamper(VECTOR, 1, (claims) => ({ ...claims, reg: "cmrsvp2" })), options)).toEqual({ ok: false, error: "bad_signature" });
    expect(verifyEnrollmentTicket(VECTOR, { ...options, secrets: ["whsec_other"] })).toEqual({ ok: false, error: "bad_signature" });
    // Rotation: any configured secret verifies.
    expect(verifyEnrollmentTicket(VECTOR, { ...options, secrets: ["whsec_new", SECRET] })).toMatchObject({ ok: true });
    expect(verifyEnrollmentTicket(VECTOR, { ...options, issuer: "https://other.example" })).toEqual({ ok: false, error: "wrong_issuer" });
    expect(verifyEnrollmentTicket(VECTOR, { ...options, now: at(CLAIMS.exp) })).toEqual({ ok: false, error: "expired" });
    expect(verifyEnrollmentTicket(VECTOR, { ...options, now: at(CLAIMS.iat - 61) })).toEqual({ ok: false, error: "not_yet_valid" });
    expect(verifyEnrollmentTicket(VECTOR, { ...options, now: at(CLAIMS.iat - 59) })).toMatchObject({ ok: true });
    const used = new Set<string>();
    const consumeJti = (jti: string) => (used.has(jti) ? false : (used.add(jti), true));
    expect(verifyEnrollmentTicket(VECTOR, { ...options, consumeJti })).toMatchObject({ ok: true });
    expect(verifyEnrollmentTicket(VECTOR, { ...options, consumeJti })).toEqual({ ok: false, error: "replayed" });
    // Hand-made tokens with a valid signature but wrong claims (the schema is strict).
    const signedRaw = (claims: Record<string, unknown>) => {
      const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "yuyu-pg-enroll+jwt" })).toString("base64url");
      const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const key = crypto.createHmac("sha256", SECRET).update("yuyu-pg-enrollment-ticket-v1").digest();
      return `${head}.${body}.${crypto.createHmac("sha256", key).update(`${head}.${body}`).digest("base64url")}`;
    };
    expect(verifyEnrollmentTicket(signedRaw({ ...CLAIMS, aud: ["peoples-gallery:enrollment"] }), options)).toEqual({ ok: false, error: "wrong_audience" });
    expect(verifyEnrollmentTicket(signedRaw({ ...CLAIMS, exp: CLAIMS.iat + 3600 }), options)).toEqual({ ok: false, error: "bad_claims" });
    expect(verifyEnrollmentTicket(signedRaw({ ...CLAIMS, email: "a@example.test" }), options)).toEqual({ ok: false, error: "bad_claims" });
    expect(() => resign({ ...CLAIMS, age: "minor" })).toThrow();
  });
});

describe("PG callbacks and notification bodies", () => {
  const status = { registrationId: "cmrsvp1", subject: SUBJECT, enrollmentId: "8c0a1b52-5b1f-4c55-9d1d-0f6c1d3c8f10" };

  it("accepts exactly the three enrollment states", () => {
    expect(pgEnrollmentStatusSchema.safeParse({ ...status, state: "added", jti: CLAIMS.jti, reason: null }).success).toBe(true);
    expect(pgEnrollmentStatusSchema.safeParse({ ...status, state: "rejected", jti: CLAIMS.jti, reason: "no_face" }).success).toBe(true);
    expect(pgEnrollmentStatusSchema.safeParse({ ...status, state: "removed", jti: null, reason: null }).success).toBe(true);
    expect(pgEnrollmentStatusSchema.safeParse({ ...status, state: "added" }).success).toBe(false); // jti required
    expect(pgEnrollmentStatusSchema.safeParse({ ...status, state: "rejected", jti: CLAIMS.jti, reason: "ugly" }).success).toBe(false);
    expect(pgEnrollmentStatusSchema.safeParse({ ...status, state: "added", jti: CLAIMS.jti, imageUrl: "https://x" }).success).toBe(false);
    expect(pgEnrollmentStatusSchema.safeParse({ ...status, enrollmentId: "../x", state: "removed" }).success).toBe(false);
  });

  it("accepts withdrawals for one registration or everything", () => {
    expect(pgConsentWithdrawSchema.safeParse({ subject: SUBJECT, scope: "event", registrationId: "r" }).success).toBe(true);
    expect(pgConsentWithdrawSchema.safeParse({ subject: SUBJECT, scope: "all", registrationId: null }).success).toBe(true);
    expect(pgConsentWithdrawSchema.safeParse({ subject: SUBJECT, scope: "event" }).success).toBe(false);
    expect(pgConsentWithdrawSchema.safeParse({ subject: SUBJECT, scope: "all", registrationId: "r" }).success).toBe(false);
  });

  it("keeps notification calls strict and bounded", () => {
    const recipient = { registrationId: "r1", subject: SUBJECT, counts: { photosOfYou: 23, newSinceLast: 23 } };
    const body = { eventId: "e", occurrenceId: null, kind: "photos_ready", link: "https://photos.example.org/app/events/1/photos", recipients: [recipient] };
    expect(pgNotificationRequestSchema.safeParse(body).success).toBe(true);
    expect(pgNotificationRequestSchema.safeParse({ ...body, recipients: [] }).success).toBe(false);
    expect(pgNotificationRequestSchema.safeParse({ ...body, recipients: Array(501).fill(recipient) }).success).toBe(false);
    expect(pgNotificationRequestSchema.safeParse({ ...body, recipients: [{ ...recipient, email: "a@example.test" }] }).success).toBe(false);
    expect(pgNotificationRequestSchema.safeParse({ ...body, recipients: [{ ...recipient, counts: { photosOfYou: 2, newSinceLast: 3 } }] }).success).toBe(false);
    expect(pgNotificationRequestSchema.safeParse({ ...body, kind: "selfie_rejected" }).success).toBe(false);
    expect(idempotencyKeySchema.safeParse(`pgn_${"a".repeat(32)}`).success).toBe(true);
    expect(idempotencyKeySchema.safeParse("pgn_short").success).toBe(false);
    expect(idempotencyKeySchema.safeParse(`evt_${"a".repeat(32)}`).success).toBe(false);
  });

  it("emails only links on People's Gallery's own public origin", () => {
    expect(allowedDeepLink("https://photos.example.org/app/events/1/photos", "https://photos.example.org", false)).toBe(true);
    expect(allowedDeepLink("https://photos.example.org.evil.test/app", "https://photos.example.org", false)).toBe(false);
    expect(allowedDeepLink("https://user:pw@photos.example.org/app", "https://photos.example.org", false)).toBe(false);
    expect(allowedDeepLink("http://photos.example.org/app", "https://photos.example.org", false)).toBe(false);
    expect(allowedDeepLink("http://pg.local:8080/app", "http://pg.local:8080", true)).toBe(true);
    expect(allowedDeepLink("javascript:alert(1)", "https://photos.example.org", true)).toBe(false);
    expect(allowedDeepLink("https://photos.example.org/app", null, false)).toBe(false);
  });

  it("validates the CLI's public URL as a bare origin", () => {
    expect(checkPublicUrl("https://photos.example.org", false)).toBeNull();
    expect(checkPublicUrl("https://photos.example.org/app", false)).toMatch(/origin only/);
    expect(checkPublicUrl("http://pg.svc.cluster.local:8080", false)).toMatch(/https/);
    expect(checkPublicUrl("http://pg.svc.cluster.local:8080", true)).toBeNull();
    expect(checkPublicUrl("https://a:b@photos.example.org", false)).toMatch(/user name/);
  });

  it("parses only well-formed photo payloads from the outbox", () => {
    const payload = { userId: "u", rsvpId: "r", eventId: "e", kind: "photos_ready", photosOfYou: 23, newSinceLast: 23, link: "https://photos.example.org/a" };
    expect(asPgPhotosPayload(payload)).toEqual(payload);
    expect(asPgPhotosPayload({ ...payload, link: "javascript:x" })).toBeNull();
    expect(asPgPhotosPayload({ ...payload, photosOfYou: -1 })).toBeNull();
    expect(asPgPhotosPayload({ ...payload, kind: "other" })).toBeNull();
  });

  it("lists the P3 types among the strict envelope schemas", () => {
    expect(pgDataSchemas["consent.withdrawn"].safeParse({ registrationId: null, subject: SUBJECT, purpose: "face_matching", scope: "all", withdrawnAt: "2026-11-14T03:30:00.000Z", revokedJtis: [] }).success).toBe(true);
    expect(pgDataSchemas["selfie.added"].safeParse({ registrationId: "r", subject: SUBJECT, enrollmentId: "e", image: "x" }).success).toBe(false);
  });
});

describe("attendee copy and templates", () => {
  it("states the D-Selfie promise, the purpose, retention, withdrawal and the age limit", () => {
    expect(FACE_NOTICE.summary).toBe("You add it here; only People's Gallery keeps it, for matching.");
    const text = FACE_NOTICE.points.join(" ");
    for (const phrase of ["never keeps a copy", "180 days", "stop face matching", "18 or older", "optional"]) expect(text).toContain(phrase);
    expect(FACE_NOTICE_VERSION).toMatch(/^pg-face-\d{4}-\d{2}-v\d+$/);
  });

  it("writes the subject and push like the design (ATT-09)", () => {
    expect(pgPhotosSubject("photos_ready", "Tech4Good Summit", 23, 23)).toBe("Your 23 photos from Tech4Good Summit are ready");
    expect(pgPhotosSubject("photos_ready", "Tech4Good Summit", 1, 1)).toBe("Your 1 photo from Tech4Good Summit is ready");
    expect(pgPhotosSubject("photos_published", "Tech4Good Summit", 30, 7)).toBe("7 new photos of you from Tech4Good Summit");
    expect(pgPhotosSubject("photos_published", "A\r\nBcc: x", 2, 1)).toBe("1 new photo of you from A Bcc: x");
    expect(pgPhotosPush("photos_ready", "Tech4Good Summit", 23, 23, "https://photos.example.org/a")).toEqual({
      title: "Your 23 photos from Tech4Good Summit are ready", body: expect.stringContaining("People's Gallery"), link: "https://photos.example.org/a",
    });
  });

  it("renders the email as Yuyu on behalf of People's Gallery, escaped, with the opt-out", () => {
    const email = buildPgPhotosEmail({
      subject: "Your 23 photos from <b>Summit</b> are ready", eventTitle: "<b>Summit</b>", photosOfYou: 23, newSinceLast: 23, ready: true,
      link: "https://photos.example.org/app/events/1/photos", recipientName: "Praveen", baseUrl: "https://yuyu.example.org",
    });
    expect(email.html).toContain("&lt;b&gt;Summit&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Summit</b>");
    expect(email.html).toContain("https://photos.example.org/app/events/1/photos");
    expect(email.html).toContain("https://yuyu.example.org/account/privacy");
    expect(email.text).toContain("Sent by Yuyu on behalf of People's Gallery");
    expect(email.text).toContain("People's Gallery found 23 photos of you");
  });
});

describe("browser selfie client", () => {
  const jpeg = (size = 1000) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });

  it("checks type, size and dimensions before anything is sent", async () => {
    expect(await prepareSelfie(new Blob(["x"], { type: "image/gif" }))).toMatchObject({ ok: false });
    expect(await prepareSelfie(new Blob([], { type: "image/png" }))).toMatchObject({ ok: false });
    expect(await prepareSelfie(jpeg(10 * 1024 * 1024 + 1))).toMatchObject({ ok: false, error: expect.stringContaining("10 MB") });
    const small = { createImageBitmap: (async () => ({ width: 300, height: 400, close() {} })) as unknown as typeof createImageBitmap, document: {} as Document };
    expect(await prepareSelfie(jpeg(), small)).toMatchObject({ ok: false, error: expect.stringContaining("too small") });
    const broken = { createImageBitmap: (async () => { throw new Error("decode"); }) as unknown as typeof createImageBitmap, document: {} as Document };
    expect(await prepareSelfie(jpeg(), broken)).toMatchObject({ ok: false });
  });

  it("re-encodes to a JPEG of at most 1600 px (dropping metadata)", async () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob: (done: (blob: Blob) => void, type: string) => done(new Blob(["out"], { type })) };
    const env = {
      createImageBitmap: (async () => ({ width: 4000, height: 3000, close: vi.fn() })) as unknown as typeof createImageBitmap,
      document: { createElement: () => canvas } as unknown as Document,
    };
    const result = await prepareSelfie(jpeg(), env);
    expect(result).toMatchObject({ ok: true });
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    if (result.ok) expect(result.blob.type).toBe("image/jpeg");
  });

  it("posts straight to People's Gallery without cookies or referrer and reads 201 and 422 answers", async () => {
    const calls: [string, RequestInit][] = [];
    const reply = (status: number, body: unknown) => (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const url = "https://photos.example.org/api/v2/integrations/yuyu/selfies";

    expect(await uploadSelfieToPg(url, VECTOR, jpeg(), reply(201, { enrollmentId: "8c0a", state: "ready", replaced: false }))).toEqual({ enrollmentId: "8c0a", state: "ready" });
    const [target, init] = calls[0]!;
    expect(target).toBe(url);
    expect(init).toMatchObject({ method: "POST", credentials: "omit", referrerPolicy: "no-referrer", mode: "cors" });
    const form = init.body as FormData;
    expect(form.get("ticket")).toBe(VECTOR);
    expect(form.get("file")).toBeInstanceOf(Blob);

    expect(await uploadSelfieToPg(url, VECTOR, jpeg(), reply(422, { enrollmentId: null, state: "rejected", reason: "multiple_faces", error: { code: "MULTIPLE_FACES" } })))
      .toEqual({ enrollmentId: null, state: "rejected", reason: "multiple_faces" });
    await expect(uploadSelfieToPg(url, VECTOR, jpeg(), reply(401, { error: { code: "INVALID_TICKET", reason: "expired" } }))).rejects.toThrow("expired");
    await expect(uploadSelfieToPg(url, VECTOR, jpeg(), reply(409, { error: { code: "TICKET_USED" } }))).rejects.toThrow("already used");
    await expect(uploadSelfieToPg(url, VECTOR, jpeg(), reply(500, "nope"))).rejects.toThrow("couldn't take");
    await expect(uploadSelfieToPg(url, VECTOR, jpeg(), (async () => { throw new TypeError("network"); }) as unknown as typeof fetch)).rejects.toThrow("Couldn't reach");
  });
});

describe("boundary inputs", () => {
  it("never mints without explicit consent and the 18+ attestation", () => {
    expect(selfieTicketInputSchema.safeParse({ rsvpId: "r", noticeVersion: FACE_NOTICE_VERSION, consent: true, adult: true }).success).toBe(true);
    expect(selfieTicketInputSchema.safeParse({ rsvpId: "r", noticeVersion: FACE_NOTICE_VERSION, consent: true, adult: false }).success).toBe(false);
    expect(selfieTicketInputSchema.safeParse({ rsvpId: "r", noticeVersion: FACE_NOTICE_VERSION, adult: true }).success).toBe(false);
    expect(mobileSelfieTicketBodySchema.safeParse({ noticeVersion: FACE_NOTICE_VERSION, consent: true, adult: true, image: "data:" }).success).toBe(false);
  });
});
