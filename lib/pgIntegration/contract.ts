import { EventPermission, EventPrivacyType, EventStatus, MembershipRole, RsvpStatus } from "@prisma/client";
import { z } from "zod";

/*
 * The People's Gallery integration contract (docs/PG_INTEGRATION.md,
 * pg-design/build/contract-yuyu-pg.md). Strict Zod DTOs for the push channel
 * (signed deliveries) and the pull channel (/api/integrations/pg/v1).
 *
 * The person is always the pairwise OIDC `subject` of People's Gallery's OAuth
 * client, never a Yuyu user id. No DTO carries an email address or other
 * contact detail, registration or feedback answers, ticket/check-in tokens or
 * links, or secrets; tests/unit/pg-integration.test.ts walks every schema to
 * keep it that way. This module has no server-only imports.
 */

export const PG_INTEGRATION_SCOPE = "yuyu.integration" as const;
export const PG_INTEGRATION_USER_AGENT = "Yuyu-PG-Integration/1";

export const PG_EVENT_TYPES = [
  "event.created",
  "event.updated",
  "event.published",
  "event.cancelled",
  "event.deleted",
  "registration.created",
  "registration.status_changed",
  "registration.updated",
  "access.changed",
  "user.sessions_revoked",
  "user.deleted",
  "ping",
] as const;
/** Defined so PG can store them; emitted from P3 (selfie step and consent records). */
export const PG_RESERVED_EVENT_TYPES = ["selfie.added", "selfie.removed", "consent.granted", "consent.withdrawn"] as const;
export type PgEventType = (typeof PG_EVENT_TYPES)[number];
export type PgAnyEventType = PgEventType | (typeof PG_RESERVED_EVENT_TYPES)[number];

const isoDate = z.string().datetime();
const id = z.string().min(1).max(128);
/** base64url(HMAC-SHA256) without padding: always 43 characters. */
export const subjectSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const pgEventSchema = z.object({
  kind: z.literal("event"),
  id,
  occurrenceId: z.null(),
  title: z.string(),
  slug: z.string(),
  startDateTime: isoDate,
  endDateTime: isoDate.nullable(),
  timezone: z.string(),
  location: z.string(),
  coverImageUrl: z.string().url().nullable(),
  status: z.nativeEnum(EventStatus),
  privacyType: z.nativeEnum(EventPrivacyType),
}).strict();
export type PgEventDto = z.infer<typeof pgEventSchema>;

export const pgEventRefSchema = z.object({ kind: z.literal("event"), id, occurrenceId: z.null() }).strict();

export const PG_REGISTRATION_STATUSES = [...Object.values(RsvpStatus), "CANCELLED", "REMOVED"] as const;
export type PgRegistrationStatus = (typeof PG_REGISTRATION_STATUSES)[number];

export const pgRegistrationSchema = z.object({
  id,
  status: z.enum(PG_REGISTRATION_STATUSES as unknown as [PgRegistrationStatus, ...PgRegistrationStatus[]]),
  displayName: z.string().min(1).max(200),
  registeredAt: isoDate,
  checkedInAt: isoDate.nullable(),
  subject: subjectSchema.nullable(),
  isCrew: z.boolean(),
  /** Age attestation arrives with the selfie step (P3); false until then. */
  isMinor: z.boolean(),
}).strict();
export type PgRegistrationDto = z.infer<typeof pgRegistrationSchema>;

const eventStatus = z.nativeEnum(EventStatus);
const registrationStatus = pgRegistrationSchema.shape.status;
const sessionsRevokedReason = z.enum(["session_version", "grant_revoked", "client_disabled"]);

export const pgDataSchemas = {
  "event.created": z.object({ event: pgEventSchema }).strict(),
  "event.updated": z.object({ event: pgEventSchema, changed: z.array(z.string()) }).strict(),
  "event.published": z.object({ event: pgEventSchema, previousStatus: eventStatus.nullable() }).strict(),
  "event.cancelled": z.object({ event: pgEventSchema, previousStatus: eventStatus.nullable() }).strict(),
  "event.deleted": z.object({ event: pgEventRefSchema }).strict(),
  "registration.created": z.object({ event: pgEventRefSchema, registration: pgRegistrationSchema }).strict(),
  "registration.status_changed": z.object({
    event: pgEventRefSchema,
    registration: pgRegistrationSchema,
    previousStatus: registrationStatus.nullable(),
  }).strict(),
  "registration.updated": z.object({ event: pgEventRefSchema, registration: pgRegistrationSchema }).strict(),
  "access.changed": z.object({
    subject: subjectSchema,
    organisationId: id,
    eventId: id.nullable(),
    occurrenceId: z.null(),
  }).strict(),
  "user.sessions_revoked": z.object({ subject: subjectSchema, reason: sessionsRevokedReason }).strict(),
  "user.deleted": z.object({ subject: subjectSchema }).strict(),
  ping: z.object({ message: z.string().max(200) }).strict(),
  // P3 placeholders (plan §3.2). Schemas are fixed now so both sides agree.
  "selfie.added": z.object({ registrationId: id, subject: subjectSchema, enrollmentId: id }).strict(),
  "selfie.removed": z.object({ registrationId: id, subject: subjectSchema, enrollmentId: id }).strict(),
  "consent.granted": z.object({
    registrationId: id,
    subject: subjectSchema,
    purpose: z.literal("face_matching"),
    noticeVersion: z.string().min(1).max(40),
    grantedAt: isoDate,
  }).strict(),
  "consent.withdrawn": z.object({
    registrationId: id.nullable(),
    subject: subjectSchema,
    purpose: z.literal("face_matching"),
    scope: z.enum(["event", "all"]),
    withdrawnAt: isoDate,
  }).strict(),
} as const satisfies Record<PgAnyEventType, z.ZodTypeAny>;

export const pgEnvelopeSchema = z.object({
  id: z.string().regex(/^evt_[0-9a-f]{32}$/),
  type: z.enum([...PG_EVENT_TYPES, ...PG_RESERVED_EVENT_TYPES]),
  createdAt: isoDate,
  organisation: z.object({ id, slug: z.string().min(1) }).strict().nullable(),
  resourceVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  data: z.record(z.string(), z.unknown()),
}).strict();
export type PgEnvelope = z.infer<typeof pgEnvelopeSchema>;

/** Validates `data` against its type's strict schema and returns a clean envelope. */
export function buildPgEnvelope(params: {
  id: string;
  type: PgAnyEventType;
  createdAt: Date;
  organisation: { id: string; slug: string } | null;
  resourceVersion: number;
  data: unknown;
}): PgEnvelope {
  const data = pgDataSchemas[params.type].parse(params.data) as Record<string, unknown>;
  return pgEnvelopeSchema.parse({
    id: params.id,
    type: params.type,
    createdAt: params.createdAt.toISOString(),
    organisation: params.organisation ? { id: params.organisation.id, slug: params.organisation.slug } : null,
    resourceVersion: params.resourceVersion,
    data,
  });
}

/**
 * The resource key PG versions an envelope on (contract §1.2). Internal keys
 * hold a Yuyu user id; the delivered key holds the subject instead.
 */
export function publicResourceKey(internalKey: string, subjectOf: (userId: string) => string): string {
  const access = /^access:([^:]+):(.+)$/.exec(internalKey);
  if (access) return `access:${subjectOf(access[1]!)}:${access[2]}`;
  const user = /^user:(.+)$/.exec(internalKey);
  if (user) return `user:${subjectOf(user[1]!)}`;
  return internalKey;
}

// ── Pull channel ─────────────────────────────────────────────────────────

export const PG_API_DEFAULT_LIMIT = 50;
export const PG_API_MAX_LIMIT = 100;

export const pgApiListQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PG_API_MAX_LIMIT).default(PG_API_DEFAULT_LIMIT),
  updatedSince: isoDate.optional(),
  organisationId: id.optional(),
}).strict();

export const pgApiOrganisationSchema = z.object({ id, slug: z.string(), name: z.string(), enabledAt: isoDate }).strict();

export const pgApiEventItemSchema = z.object({
  organisation: z.object({ id, slug: z.string() }).strict(),
  resourceVersion: z.number().int().nonnegative(),
  deleted: z.boolean(),
  /** The full event, or `{kind,id,occurrenceId}` when `deleted` is true. */
  event: z.union([pgEventSchema, pgEventRefSchema]),
}).strict();

export const pgApiRegistrationItemSchema = z.object({
  resourceVersion: z.number().int().nonnegative(),
  registration: pgRegistrationSchema,
}).strict();

export const PG_ROLES = ["admin", "viewer"] as const;
export type PgRole = (typeof PG_ROLES)[number];

export const pgApiEventRoleItemSchema = z.object({
  subject: subjectSchema,
  orgRole: z.nativeEnum(MembershipRole).nullable(),
  collaboratorPermissions: z.array(z.nativeEnum(EventPermission)),
  /** The D-2 mapping (plan §2.4) applied by Yuyu; PG may re-derive it from the facts. */
  pgRole: z.enum(PG_ROLES).nullable(),
}).strict();

export const pgApiUserRolesSchema = z.object({
  subject: subjectSchema,
  organisations: z.array(z.object({ id, slug: z.string(), role: z.nativeEnum(MembershipRole) }).strict()),
  events: z.array(z.object({
    organisationId: id,
    eventId: id,
    occurrenceId: z.null(),
    collaboratorPermissions: z.array(z.nativeEnum(EventPermission)),
    registration: z.object({ id, status: z.nativeEnum(RsvpStatus), isCrew: z.boolean() }).strict().nullable(),
  }).strict()),
}).strict();

export function pgPage<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), pagination: z.object({ nextCursor: z.string().nullable() }).strict() }).strict();
}

// ── Role mapping (D-2) ───────────────────────────────────────────────────

const ADMIN_GRANTS: readonly EventPermission[] = [EventPermission.EDIT_DETAILS, EventPermission.PUBLISH_AND_SCHEDULE];

/**
 * Plan §2.4 / decision D-2: org OWNER/ADMIN and collaborators who can edit or
 * publish become PG event admins; MANAGE_REGISTRATIONS and plain MEMBERs
 * become viewers; CHECK_IN, MANAGE_INVITATIONS and JUDGE alone grant nothing.
 * Registrations (attendee role) are separate facts.
 */
export function pgRoleFor(facts: { orgRole: MembershipRole | null; collaboratorPermissions: readonly EventPermission[] }): PgRole | null {
  if (facts.orgRole === MembershipRole.OWNER || facts.orgRole === MembershipRole.ADMIN) return "admin";
  if (facts.collaboratorPermissions.some((permission) => ADMIN_GRANTS.includes(permission))) return "admin";
  if (facts.collaboratorPermissions.includes(EventPermission.MANAGE_REGISTRATIONS)) return "viewer";
  if (facts.orgRole === MembershipRole.MEMBER) return "viewer";
  return null;
}
