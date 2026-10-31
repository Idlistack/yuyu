# People's Gallery integration

[Documentation index](README.md)

People's Gallery (PG) is the operator's photo app for Yuyu events. It signs people in with Yuyu's [OpenID Connect provider](OIDC_PROVIDER.md) and mirrors the events, registrations and roles of the organisations that use it, so attendees and organisers see the right photos. This page describes the Yuyu side of that channel. The shared contract with PG is `pg-design/build/contract-yuyu-pg.md`; PG implements the receiving end.

The channel is **first party and instance level**. It is separate from [organisation webhooks](WEBHOOKS.md), which are tenant-configured, strip identity and only reach the public internet. It reuses their signing scheme, retry schedule, delivery client and SSRF checks.

- **Push:** Yuyu signs and sends one envelope per change (`PgIntegrationDelivery` outbox).
- **Pull:** PG backfills and reconciles through `/api/integrations/pg/v1` with a client-credentials token.

The person is always the **pairwise `subject`** of PG's OAuth client: the same value as PG's ID-token `sub`, `base64url(HMAC-SHA256(per-client salt, "yuyu-oidc-sub-v1|" + userId))`. PG never receives a Yuyu user id, an email address or other contact detail, registration or feedback answers, or ticket, check-in, certificate or invitation tokens. The DTOs are strict Zod schemas in `lib/pgIntegration/contract.ts`; `tests/unit/pg-integration.test.ts` walks every schema and fails on such a field.

## Setup (operator)

The integration is managed with an operator CLI, like the OIDC clients. There is no super-admin page in this release; every change is audited. Run the CLI with the application's environment (`DATABASE_URL`, `MFA_ENCRYPTION_KEY`), for example inside the migrator job:

```bash
# 1. The PG OAuth client (once; see docs/OIDC_PROVIDER.md). It must be confidential and first party.
npm run oauth:client -- register --name "People's Gallery" \
  --redirect-uri https://photos.example.org/api/v2/auth/yuyu/callback \
  --scopes "openid profile yuyu.events" --first-party

# 2. The integration: endpoint and signing secret (printed once). Adds the scope yuyu.integration to the client.
npm run pg:integration -- configure --client-id yyc_… \
  --endpoint-url https://photos.example.org/api/v2/integrations/yuyu/events

#    In the same k3s cluster, an in-cluster receiver is allowed only with the explicit switch:
npm run pg:integration -- configure --client-id yyc_… \
  --endpoint-url http://peoplegallery-api.pg.svc.cluster.local:8000/api/v2/integrations/yuyu/events \
  --allow-internal-target

# 3. Each organisation that uses "Photos by People's Gallery"
npm run pg:integration -- enable-org --org t4g

# 4. PG's public browser origin: where attendees upload selfies, and the only
#    origin allowed in "your photos are ready" email links. Without it the
#    selfie step and the notification API stay off.
npm run pg:integration -- configure --client-id yyc_… \
  --endpoint-url https://photos.example.org/api/v2/integrations/yuyu/events \
  --public-url https://photos.example.org
```

| Command | Effect |
| --- | --- |
| `configure --client-id --endpoint-url [--allow-internal-target \| --public-target-only] [--public-url <origin>]` | Creates the integration (prints the `whsec_…` secret once) or changes the endpoint, client, target rule or PG's public origin (an origin only; `https://`, or `http://` only with `--allow-internal-target`). Audited `PG_INTEGRATION_CONFIGURED` / `PG_INTEGRATION_UPDATED` (hosts only) |
| `status` | Endpoint host, client, enabled organisations, last success/failure, delivery counts by status |
| `enable-org --org <slug>` / `disable-org --org <slug>` | Shares an organisation (or stops sharing it). Enabling seeds a fresh version for every existing event and registration so PG's backfill lists them all. Audited |
| `enable` / `disable` | Switches the whole integration. While disabled nothing new is captured and queued deliveries wait; nothing is lost |
| `rotate-secret` | New signing secret, printed once; the next delivery uses it. PG accepts a list of secrets during rotation |
| `ping` | Queues a signed `ping` envelope |
| `redrive [--event-id evt_…]` | Puts dead-lettered deliveries back in the queue |

The signing secret is 32 random bytes (`whsec_` + base64url), stored only as AES-256-GCM ciphertext under a key derived from `MFA_ENCRYPTION_KEY` with its own HKDF label (`yuyu-pg-integration-signing-secret-v1`). It is never shown again, logged or written to audit metadata. If `MFA_ENCRYPTION_KEY` changes, deliveries fail with "Signing secret unreadable"; rotate the secret.

### Target rules

By default the endpoint must satisfy the [organisation webhook SSRF rules](WEBHOOKS.md#target-rules-ssrf-protection): public `https://` on port 443 or 8443, every resolved address public.

`--allow-internal-target` is an operator decision recorded on the integration (`PgIntegration.allowInternalTarget`, audited). It allows `http://` or `https://`, any port, private addresses (RFC 1918, CGNAT `100.64/10` such as k3s pod and service ranges, IPv6 ULA) and cluster names such as `*.svc.cluster.local`. Even then, these stay blocked: loopback, link-local (including the `169.254.169.254` metadata service), unspecified, multicast and reserved addresses. Loopback opens only with the development/test switch `WEBHOOKS_ALLOW_PRIVATE_TARGETS=1`, which a production server ignores. The check runs before every delivery, and the request connects only to the vetted address (pinned DNS lookup). Credentials in the URL are refused; redirects are not followed.

## Capture: transactional with the change

Changes are captured by **database triggers** (migration `20261031010000_pg_integration`) in the same transaction as the change. A rolled-back mutation leaves no delivery; a committed one always has its delivery. Every path is covered: dashboard Server Actions, `lib/core/*` mutations used by the mobile API, cascades and scripts. Captures happen only for organisations in `PgIntegrationOrganisation` while the integration is enabled. With no integration configured, each trigger does one indexed lookup and returns.

| Table change | Envelope type |
| --- | --- |
| `Event` insert | `event.created` (any status) |
| `Event` update of title, slug, start, end, timezone, location, cover, status or privacy | `event.published` when the status became `PUBLISHED`, `event.cancelled` when it became `CANCELLED`, otherwise `event.updated` with `changed` |
| `Event` delete | `event.deleted` (its registrations' cascade deletes are not sent separately) |
| `RSVP` insert (one-off events) | `registration.created` |
| `RSVP` status change | `registration.status_changed` |
| `RSVP` account link or crew flag change | `registration.updated` |
| `RSVP` delete | `registration.status_changed` with status `CANCELLED`, or `REMOVED` when an organiser removed it (`markRsvpDeletionAsRemovalTx` in `lib/core/rsvpAdmin.ts` and the team removal core) |
| `Membership` insert, role change, delete; `EventCollaborator` insert, permission change, delete | `access.changed` |
| `User.sessionVersion` bump (password change or reset, MFA enabled or disabled, sign out everywhere) | `user.sessions_revoked` (`session_version`) |
| PG grant disconnected (Account → Security → Connected apps) | `user.sessions_revoked` (`grant_revoked`) |
| PG OAuth client disabled | `user.sessions_revoked` (`client_disabled`) for every person with a grant |
| `User` delete | `user.deleted` |

User-level events are sent only for people with a live grant to PG's client: someone who never connected PG produces nothing. The trigger snapshot holds ids, statuses, timestamps and the guest name used for `displayName`; never a guest email, answers or the check-in token. The envelope is built from it once, on the first delivery attempt, after which the snapshot is cleared.

Series occurrences are not synced in this release (`occurrenceId` is always `null`), like series status changes in organisation webhooks.

## Envelope and versions

```http
POST /api/v2/integrations/yuyu/events HTTP/1.1
content-type: application/json
user-agent: Yuyu-PG-Integration/1
x-yuyu-event-id: evt_3f1c0a9b7d2e4f6a8b9c0d1e2f3a4b5c
x-yuyu-event-type: event.updated
x-yuyu-signature: t=1792656000,v1=…
```

```json
{
  "id": "evt_3f1c0a9b7d2e4f6a8b9c0d1e2f3a4b5c",
  "type": "event.updated",
  "createdAt": "2026-10-31T10:00:00.000Z",
  "organisation": { "id": "cmorg123", "slug": "t4g" },
  "resourceVersion": 1793440800123,
  "data": { "event": { "kind": "event", "id": "cmevent123", "occurrenceId": null, "title": "Tech4Good Summit 2026", "slug": "t4g-summit-2026", "startDateTime": "2026-11-14T03:30:00.000Z", "endDateTime": "2026-11-14T12:30:00.000Z", "timezone": "Asia/Kolkata", "location": "NIMHANS Convention Centre, Bengaluru", "coverImageUrl": null, "status": "PUBLISHED", "privacyType": "PUBLIC" }, "changed": ["title"] }
}
```

- **Signature:** exactly the org-webhook scheme: `v1 = hex(HMAC-SHA256(full secret as UTF-8, "<t>.<raw body>"))`, tolerance 300 seconds. Every attempt is re-signed with a fresh `t`. The shared test vector is pinned on both sides (`tests/unit/pg-integration.test.ts`).
- **Idempotency:** `id` is stable across retries and redrives; PG de-duplicates on it. The body is serialised with sorted keys, so a retry is byte for byte identical.
- **Ordering:** `resourceVersion` increases strictly **per resource** in commit order. The trigger bumps a row-locked counter (`PgIntegrationResource`) to `max(previous + 1, epoch milliseconds)` in the same transaction. Resource keys: `event:{id}:` (with the occurrence id after the colon when series are synced), `registration:{id}`, `access:{subject}:{organisationId}`, `user:{subject}`, `selfie:{registrationId}`, `consent:{registrationId}` (or an internal per-person key for `scope: "all"`). Every `data` is a full snapshot, so PG applies a change only when `resourceVersion` is greater than what it stored, and safely drops older ones. Deliveries can arrive out of order.
- `organisation` is `null` for `user.*` and `ping`.

### Catalogue

`EventDTO` = `{ kind: "event", id, occurrenceId: null, title, slug, startDateTime, endDateTime, timezone, location, coverImageUrl (absolute URL or null), status, privacyType }`.
`RegistrationDTO` = `{ id, status (CONFIRMED | WAITLISTED | PENDING_APPROVAL | REJECTED | CANCELLED | REMOVED), displayName (falls back to "Participant"), registeredAt, checkedInAt, subject (null for a guest without an account), isCrew, isMinor (true once the account attested to being under 18 in the selfie step) }`.
Event references are `{ kind: "event", id, occurrenceId: null }`.

| Type | `data` |
| --- | --- |
| `event.created` | `{ event }` |
| `event.updated` | `{ event, changed }` |
| `event.published`, `event.cancelled` | `{ event, previousStatus }` |
| `event.deleted` | `{ event: ref }` |
| `registration.created`, `registration.updated` | `{ event: ref, registration }` |
| `registration.status_changed` | `{ event: ref, registration, previousStatus }` |
| `access.changed` | `{ subject, organisationId, eventId (null for an organisation role), occurrenceId: null }`. PG re-reads the person's roles from the API |
| `user.sessions_revoked` | `{ subject, reason }` |
| `user.deleted` | `{ subject }` |
| `ping` | `{ message }` |
| `consent.granted` | `{ registrationId, subject, purpose: "face_matching", noticeVersion, grantedAt }`: a selfie ticket was minted with a new grant or a new notice version. Key `consent:{registrationId}` |
| `consent.withdrawn` | `{ registrationId, subject, purpose, scope: "event" \| "all", withdrawnAt }`. `scope: "all"` has `registrationId: null` and `organisation: null` ("Stop face matching everywhere", or a withdrawal made in PG). PG purges the selfie and matches |
| `selfie.added` | `{ registrationId, subject, enrollmentId }`: PG reported an accepted selfie (confirmation; PG stores it as informational). Key `selfie:{registrationId}` |
| `selfie.removed` | same shape: the selfie must go (withdrawal, a replaced enrollment, or an upload that arrived after the person withdrew). PG purges it if it is the current one |

### Role mapping (decision D-2)

`pgRoleFor` in `lib/pgIntegration/contract.ts` is the reference mapping; PG applies the same table to the role facts:

| Yuyu fact | PG role on the event |
| --- | --- |
| Organisation `OWNER` or `ADMIN` | `admin` (every event of the organisation) |
| Collaborator with `EDIT_DETAILS` or `PUBLISH_AND_SCHEDULE` | `admin` |
| Collaborator with `MANAGE_REGISTRATIONS` | `viewer` |
| Organisation `MEMBER` | `viewer` |
| Only `CHECK_IN`, `MANAGE_INVITATIONS` or `JUDGE` | none |
| Confirmed registration with a subject (crew included) | `attendee` (PG) |

## Delivery

The one-minute outbox worker (`lib/outboxWorker.ts`, and `POST /api/internal/outbox`) runs `deliverPgIntegrationBatch` after organisation webhooks. A failure there never fails the email pass. Each server process also runs a separate **10-second** People's Gallery pass (`PG_INTEGRATION_INTERVAL_MS`), so a publish, a registration, a consent withdrawal or a session revocation reaches PG in seconds rather than up to a minute; it never overlaps itself, and with nothing queued it is one indexed lookup. A deployment that relies only on the external scheduler gets the one-minute cadence.

- Rows are claimed with `FOR UPDATE SKIP LOCKED` in capture order and finished under a lease; a lease older than 5 minutes returns to the queue. Up to 50 per pass, 5 at a time. Nothing is claimed while the integration is missing or disabled.
- 10-second timeout, 256 KB body cap, no redirects. Any `2xx` is success.
- **Retries:** up to 8 attempts on the org-webhook schedule (1 min, 5 min, 30 min, 1 h, 3 h, 6 h, 12 h, each ±20 % jitter; about 22.6 hours). `400` and `413` from PG are permanent (the envelope is malformed) and stop at once.
- **Dead letter:** a row that fails permanently, exhausts its attempts, or whose envelope fails its strict schema ("Envelope failed its schema", never sent) is `FAILED` with a short, redacted `lastError` (no URL, no secret). `npm run pg:integration -- redrive` re-queues them. There is no automatic disabling: PG's nightly reconciliation through the API closes any gap.
- A row whose organisation no longer exists is skipped (`FAILED`, "Skipped: the organisation no longer exists").
- Retention: finished deliveries and deleted-resource tombstones are removed after 30 days; queued and leased rows are kept.

## Integration API

Base `/api/integrations/pg/v1`. Bearer token from the token endpoint:

```http
POST /oauth/token
Authorization: Basic base64(yyc_…:yys_…)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=yuyu.integration
→ { "access_token": "yoi_…", "token_type": "Bearer", "expires_in": 600, "scope": "yuyu.integration" }
```

`client_credentials` is granted only to a confidential, first-party client that lists a machine scope (`yuyu.integration`). The token is opaque, lives 10 minutes, is stored as a SHA-256 digest (`OAuthClientToken`), carries no user and is refused by `/oauth/userinfo`. The API also requires that the token's client **is** the integration's client: another client with the scope gets `403`.

Responses are strict DTOs, `Cache-Control: no-store`. Only organisations enabled for the integration are visible; anything else answers `404`. Each client is limited to 600 requests per minute (`pgIntegrationApi`), on top of the global per-address API limit. Lists use opaque keyset cursors: `?cursor=&limit=` (default 50, maximum 100) → `{ "data": [...], "pagination": { "nextCursor": string | null } }`. Repeated or unknown query parameters are `400`.

| Route | Returns |
| --- | --- |
| `GET /organisations` | `{ data: [{ id, slug, name, enabledAt }] }` |
| `GET /events?updatedSince=&organisationId=&cursor=&limit=` | `[{ organisation: {id, slug}, resourceVersion, deleted, event }]`, ordered by last change. `event` is the full `EventDTO`, or a reference when `deleted` is true (tombstone) |
| `GET /events/{eventId}/registrations?updatedSince=&cursor=&limit=` | `[{ resourceVersion, registration }]` in any status, including `CANCELLED`/`REMOVED` tombstones (subject kept, display name "Participant") |
| `GET /events/{eventId}/roles?cursor=&limit=` | `[{ subject, orgRole, collaboratorPermissions, pgRole }]`: everyone with organisation or collaborator access to the event, with the D-2 mapping applied; ordered by subject |
| `GET /users/{subject}/roles` | `{ data: { subject, organisations: [{id, slug, role}], events: [{ organisationId, eventId, occurrenceId: null, collaboratorPermissions, registration: {id, status, isCrew} \| null }] } }` across enabled organisations (at most 500 events of each kind). `404` unless the subject has a live grant to PG's client |

Errors are `{ "error": { "code", "message" } }`: `INVALID_REQUEST` 400, `INVALID_CREDENTIAL` 401, `INSUFFICIENT_SCOPE` 403, `RESOURCE_NOT_FOUND` 404, `RATE_LIMITED` 429 (+ `Retry-After`), `INTEGRATION_DISABLED` 503, `INTERNAL_ERROR` 500.

**Versions in the API.** Each row carries the resource's current `resourceVersion`, read in the same repeatable-read snapshot as its data. PG should apply a backfill row when its version is **at least** the stored one: an equal version never carries older data. `updatedSince` filters by the time of the last captured change; because a transaction can commit after a later one started, poll with an overlap of a few minutes.

## Selfie step

Decision D-Selfie (plan §4): the attendee adds an optional selfie **in Yuyu**, and **only People's Gallery keeps it**, for matching the person in that event's photos. The browser (or the Yuyu app) uploads the image straight to PG with a short-lived ticket. Yuyu never receives, stores, hashes or logs the image: no Yuyu route accepts image bytes for this, and the consent tables hold only consent, the age attestation, the state PG reports, PG's opaque enrollment id and ticket ids.

**Where it appears.** On the ticket page (`/ticket/{token}#find-your-photos`) for a signed-in account that owns a **confirmed** registration of a one-off event in an organisation shared with PG, while the integration is enabled and has a public URL, until 180 days after the event ends (D-7). A guest registration without an account sees nothing until it is claimed (D-4); someone else viewing the ticket is asked to sign in. The event page's registration card points a confirmed attendee to it, and **Account → Privacy** lists every event with face matching. The Yuyu app uses `/api/mobile/v1/me/registrations/{rsvpId}/face-matching` (GET view and notice, POST `…/ticket`, POST `…/under-18`, DELETE to stop; see [the mobile API](mobile-api.openapi.yaml)).

**Notice and consent.** The versioned notice (`lib/pgIntegration/faceNotice.ts`, `FACE_NOTICE_VERSION`) is shown before the camera: purpose, that Yuyu keeps no copy, who sees results, retention (180 days after the event), that it is optional and can be stopped at any time, and that it is for adults only. Two separate checkboxes, "Match me in this event's photos" and "I am 18 or older", must both be ticked; the ticket request must carry `consent: true`, `adult: true` and the current notice version or nothing is written. Changing the wording means a new version, and people who agreed to an older one are asked again before their next selfie. "I'm under 18" records a `MINOR` attestation for that registration: no ticket can ever be minted for it (a database check forbids a grant on a minor's record), and PG learns `isMinor: true` through `registration.updated` and the registrations API (D-12).

`PgFaceConsent` (one per registration) records the account, age attestation, notice version, `grantedAt`, `withdrawnAt` and the selfie state (`NONE`, `PENDING`, `ADDED`, `REJECTED`, `REMOVED`). Audit: `PG_FACE_CONSENT_GRANTED`, `PG_FACE_CONSENT_WITHDRAWN`, `PG_FACE_AGE_UNDER_18`.

### Enrollment ticket

Contract v1.2 §4.1. A compact JWS, HS256, header exactly `{"alg":"HS256","typ":"yuyu-pg-enroll+jwt"}`. The key is `HMAC-SHA256(key = the integration signing secret "whsec_…" as UTF-8, msg = "yuyu-pg-enrollment-ticket-v1")`, so the delivery signature and the ticket never share a key; PG tries each configured secret during a rotation. Claims: `iss` (Yuyu's issuer, as for OIDC), `aud: "peoples-gallery:enrollment"`, `sub` (pairwise subject), `jti` (`yet_` + 32 hex), `iat`, `exp = iat + 600`, `org`, `evt`, `occ: null`, `reg`, `pur: "face_matching"`, `nv` (notice version), `age: "adult"`, `act` (`add` or `replace`). `lib/pgIntegration/enrollmentTicket.ts` holds the reference signer and verifier; the shared vector is pinned in `tests/unit/pg-selfie.test.ts` and in the contract.

The ticket is a bearer capability for one upload: it is returned once to its owner, never logged, audited or stored. Yuyu keeps only its `jti`, expiry and outcome (`PgSelfieTicket`, purged a day after expiry). At most **5 tickets per person per hour**; the Server Actions and the mobile API also apply their usual rate limits.

The browser re-encodes the photo to a JPEG of at most 1,600 px (dropping EXIF/GPS; HEIC is passed through for PG to decode) and POSTs `multipart/form-data` (`ticket`, `file`) to `{publicUrl}/api/v2/integrations/yuyu/selfies` with `credentials: "omit"` and no referrer. PG answers `201 { enrollmentId, state: "ready" }`, or `422 { state: "rejected", reason }` for a photo that fails its quality gate (no face, several faces, face too small, too dark or blurry, unreadable). The CSP already allows `connect-src https:` and `Permissions-Policy` allows `camera=(self)`. A development server (`next dev`) also allows `http://localhost:*` and `http://127.0.0.1:*`, so a local PG on plain http works; production allows https only.

### PG callbacks

Through the integration API (Bearer `yoi_`, as above):

| Route | Body | Effect |
| --- | --- | --- |
| `POST /enrollments/status` | `{ registrationId, subject, enrollmentId, jti, state: "added" \| "rejected" \| "removed", reason }` (`jti` required for `added`/`rejected`, `null` for `removed`) | `200 { data: { selfieState } }`. Each `jti` confirms one enrollment: an identical replay is `200`, the same `jti` with another `enrollmentId` is `409 TICKET_USED`. `404` unless the registration belongs to `subject`, in an enabled organisation, and the ticket was issued for it. `added` emits `selfie.added` (and `selfie.removed` for a replaced one); an upload whose ticket predates a withdrawal is answered by `selfie.removed`. A rejected retake keeps an existing selfie |
| `POST /consents/withdraw` | `{ subject, scope: "event", registrationId }` or `{ subject, scope: "all", registrationId: null }` | `200 { data: { withdrawn } }`, idempotent. The person withdrew inside PG; Yuyu records it and echoes `consent.withdrawn` |

Bodies are strict JSON (`application/json`, at most 256 KB); unknown fields or a query string are `400`.

**Withdrawal in Yuyu.** "Stop face matching" (ticket page, Account → Privacy, or `DELETE` in the app) marks the consent withdrawn, spends outstanding tickets and emits `consent.withdrawn` (+ `selfie.removed` when an enrollment exists) in the same transaction. "Stop face matching everywhere" withdraws every registration and emits one `consent.withdrawn` with `scope: "all"`. PG purges the selfie and matches (plan §4.4). Registrations that leave `CONFIRMED` are purged by PG from the `registration.*` events; deleting the account removes the consent rows (`user.deleted`).

## Attendee notifications

Decision D-Mail (plan §5.7): People's Gallery never emails attendees and holds no addresses. It asks Yuyu, and Yuyu sends the email **as Yuyu, on behalf of People's Gallery**.

```http
POST /api/integrations/pg/v1/notifications
Authorization: Bearer yoi_…
Idempotency-Key: pgn_<8–64 of [A-Za-z0-9_-]>
Content-Type: application/json

{ "eventId": "…", "occurrenceId": null, "kind": "photos_ready" | "photos_published",
  "link": "https://photos.example.org/app/events/<pg id>/photos",
  "recipients": [ { "registrationId": "…", "subject": "<43>", "counts": { "photosOfYou": 23, "newSinceLast": 23 } } ] }
→ 202 { "data": { "accepted": 1, "skipped": [ { "registrationId": "…", "reason": "not_found" | "not_confirmed" | "withdrawn" | "unsubscribed" | "no_email" | "duplicate" } ] } }
```

- 1 to 500 recipients; `photosOfYou` 1–100,000; `newSinceLast` at most `photosOfYou`. Strict body.
- `link` must be on **PG's public origin** (`--public-url`), `https` (or `http` only with an internal target); anything else is `400`, so Yuyu never emails a link to another site.
- The event must belong to an enabled organisation (`404`). A recipient must be a registration of that event whose account's pairwise subject equals `subject` (`not_found` otherwise, including guests: no oracle beyond that), `CONFIRMED`, with face-matching consent given and not withdrawn, the photo email switched on (Account → Privacy, default on) and an address.
- **Idempotency:** the receipt (`PgNotificationReceipt`: key, SHA-256 of the canonical body, the `202` body) commits in the same transaction as the queued emails and is kept 7 days. The same key and body return the stored answer and send nothing; the same key with another body is `409 IDEMPOTENCY_CONFLICT`.
- **Rate limits:** 60 notification calls per minute per client (`pgNotifications`) on top of the 600 requests per minute API budget. Debounce (one per person, event and 6 hours) and zero-count suppression are PG's job.
- **Delivery:** one `pg-photos` outbox email per recipient (a bulk kind: transactional mail goes first). The payload holds ids and counts only; at send time the worker re-checks the registration, consent and preference and drops the row if any changed. Subject `Your 23 photos from <event> are ready` / `7 new photos of you from <event>`; the footer says it was sent on behalf of People's Gallery and links to Account → Privacy. Audit `PG_NOTIFICATION_ACCEPTED` with counts only.
- **Push:** Yuyu has no push channel yet. `pgPhotosPush` in `lib/pgIntegration/notifications.ts` fixes the text and deep link (ATT-09) for when the app registers devices.

## Data model

`PgIntegration` (one row, with `publicUrl`), `PgIntegrationOrganisation`, `PgIntegrationResource` (per-resource version counter and tombstone; its key is internal and may embed a user id, which is never sent), `PgIntegrationDelivery` (outbox), `OAuthClientToken`, and `OAuthGrant.subject` (the client's pairwise subject, filled when a grant is approved, so `/users/{subject}/roles` needs no reverse search). `npm run db:verify` checks that the twelve `pg_integration_*` triggers exist. P3 (migration `20261101000000_pg_selfie_notifications`) adds `PgFaceConsent`, `PgSelfieTicket`, `PgNotificationReceipt` and `UserNotificationPreference`; none holds image data.

## Not in this release

- A super-admin page for the integration (the CLI covers it).
- Series occurrences.
- Push notifications (no device registration yet); `selfie_rejected` and `matching_complete` notification kinds (PG shows those in its own UI).
- Face matching for series events.
