import crypto from "node:crypto";
import { z } from "zod";
import { FACE_MATCHING_PURPOSE, subjectSchema, ticketJtiSchema } from "@/lib/pgIntegration/contract";

/*
 * Selfie enrollment tickets (contract v1.2 §P3.1, docs/PG_INTEGRATION.md#enrollment-ticket).
 *
 * Yuyu mints a short-lived ticket; the attendee's browser (or the Yuyu app)
 * uploads the selfie straight to People's Gallery with it, so the image never
 * passes through or stays in Yuyu (decision D-Selfie). PG verifies the ticket
 * with the integration signing secret it already holds and accepts each `jti`
 * once.
 *
 * Format: compact JWS, HS256, header exactly {"alg":"HS256","typ":"yuyu-pg-enroll+jwt"}.
 * Key: HMAC-SHA256(key = the full "whsec_…" secret as UTF-8, msg = TICKET_KEY_LABEL),
 * so the delivery signature and the ticket never share a key.
 *
 * This module is pure (node:crypto only) so the shared test vectors run
 * anywhere; `verifyEnrollmentTicket` is the reference PG implements.
 */

export const TICKET_TYP = "yuyu-pg-enroll+jwt";
export const TICKET_AUDIENCE = "peoples-gallery:enrollment";
export const TICKET_KEY_LABEL = "yuyu-pg-enrollment-ticket-v1";
export const TICKET_TTL_SECONDS = 600;
/** Clock skew allowed on `iat` only; `exp` is never extended. */
export const TICKET_IAT_SKEW_SECONDS = 60;

const HEADER = { alg: "HS256", typ: TICKET_TYP } as const;

export const enrollmentTicketClaimsSchema = z.object({
  iss: z.string().url(),
  aud: z.literal(TICKET_AUDIENCE),
  sub: subjectSchema,
  jti: ticketJtiSchema,
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  org: z.string().min(1).max(128),
  evt: z.string().min(1).max(128),
  occ: z.null(),
  reg: z.string().min(1).max(128),
  pur: z.literal(FACE_MATCHING_PURPOSE),
  nv: z.string().min(1).max(40),
  age: z.literal("adult"),
  act: z.enum(["add", "replace"]),
}).strict();
export type EnrollmentTicketClaims = z.infer<typeof enrollmentTicketClaimsSchema>;

export function ticketKey(secret: string): Buffer {
  return crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(TICKET_KEY_LABEL).digest();
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

export function newTicketJti() {
  return `yet_${crypto.randomBytes(16).toString("hex")}`;
}

/** Signs exactly the given claims (validated first). Key order is fixed by the schema for stable vectors. */
export function signEnrollmentTicket(secret: string, claims: EnrollmentTicketClaims): string {
  const parsed = enrollmentTicketClaimsSchema.parse(claims);
  const ordered: EnrollmentTicketClaims = {
    iss: parsed.iss, aud: parsed.aud, sub: parsed.sub, jti: parsed.jti, iat: parsed.iat, exp: parsed.exp,
    org: parsed.org, evt: parsed.evt, occ: parsed.occ, reg: parsed.reg, pur: parsed.pur, nv: parsed.nv, age: parsed.age, act: parsed.act,
  };
  const signingInput = `${b64url(JSON.stringify(HEADER))}.${b64url(JSON.stringify(ordered))}`;
  const signature = crypto.createHmac("sha256", ticketKey(secret)).update(signingInput).digest();
  return `${signingInput}.${b64url(signature)}`;
}

export function mintEnrollmentTicket(params: {
  secret: string;
  issuer: string;
  subject: string;
  organisationId: string;
  eventId: string;
  registrationId: string;
  noticeVersion: string;
  action: "add" | "replace";
  now?: Date;
  jti?: string;
}) {
  const iat = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const claims: EnrollmentTicketClaims = {
    iss: params.issuer,
    aud: TICKET_AUDIENCE,
    sub: params.subject,
    jti: params.jti ?? newTicketJti(),
    iat,
    exp: iat + TICKET_TTL_SECONDS,
    org: params.organisationId,
    evt: params.eventId,
    occ: null,
    reg: params.registrationId,
    pur: FACE_MATCHING_PURPOSE,
    nv: params.noticeVersion,
    age: "adult",
    act: params.action,
  };
  return { ticket: signEnrollmentTicket(params.secret, claims), claims, expiresAt: new Date(claims.exp * 1000) };
}

export type TicketVerifyError =
  | "malformed"
  | "bad_header"
  | "bad_signature"
  | "bad_claims"
  | "wrong_issuer"
  | "wrong_audience"
  | "not_yet_valid"
  | "expired"
  | "replayed";

export type TicketVerifyResult = { ok: true; claims: EnrollmentTicketClaims } | { ok: false; error: TicketVerifyError };

function decodeJson(part: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error("not base64url");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/**
 * Reference verification (PG implements the same). `secrets` is the list of
 * accepted integration secrets (several during a rotation). `consumeJti`
 * records the jti and returns false when it was already used: single use.
 */
export function verifyEnrollmentTicket(
  token: string,
  options: { secrets: string[]; issuer: string; now?: Date; consumeJti?: (jti: string, exp: number) => boolean },
): TicketVerifyResult {
  if (typeof token !== "string" || token.length > 4096) return { ok: false, error: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return { ok: false, error: "malformed" };
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  let header: unknown;
  let payload: unknown;
  try {
    header = decodeJson(headerPart);
    payload = decodeJson(payloadPart);
  } catch {
    return { ok: false, error: "malformed" };
  }
  const headerOk = header && typeof header === "object" && !Array.isArray(header)
    && Object.keys(header).length === 2 && (header as Record<string, unknown>).alg === "HS256" && (header as Record<string, unknown>).typ === TICKET_TYP;
  if (!headerOk) return { ok: false, error: "bad_header" };
  if (!/^[A-Za-z0-9_-]{43}$/.test(signaturePart)) return { ok: false, error: "bad_signature" };
  const signature = Buffer.from(signaturePart, "base64url");
  const signingInput = `${headerPart}.${payloadPart}`;
  const valid = options.secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", ticketKey(secret)).update(signingInput).digest();
    return expected.length === signature.length && crypto.timingSafeEqual(expected, signature);
  });
  if (!valid) return { ok: false, error: "bad_signature" };
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "aud" in payload && (payload as Record<string, unknown>).aud !== TICKET_AUDIENCE) {
    return { ok: false, error: "wrong_audience" };
  }
  const claims = enrollmentTicketClaimsSchema.safeParse(payload);
  if (!claims.success) return { ok: false, error: "bad_claims" };
  if (claims.data.iss !== options.issuer) return { ok: false, error: "wrong_issuer" };
  if (claims.data.exp - claims.data.iat !== TICKET_TTL_SECONDS) return { ok: false, error: "bad_claims" };
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (claims.data.iat > nowSeconds + TICKET_IAT_SKEW_SECONDS) return { ok: false, error: "not_yet_valid" };
  if (nowSeconds >= claims.data.exp) return { ok: false, error: "expired" };
  if (options.consumeJti && !options.consumeJti(claims.data.jti, claims.data.exp)) return { ok: false, error: "replayed" };
  return { ok: true, claims: claims.data };
}
