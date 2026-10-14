# Features

[Documentation index](README.md)

## Accounts and authentication

- Email/password signup and sign-in with bcrypt password hashing and one-time inbox verification before account activation.
- Account area with Profile (name, photo, email status, Light/Dark/System appearance), Registrations (your upcoming and past tickets with cancel, certificates, and a personal JSON data export that never includes passwords, security codes or ticket links), Organisations (memberships and roles, event co-organiser roles, pending co-organiser invites, and leaving an organisation, blocked for the only owner), and Security (password, two-step verification, sign-in methods, recent security activity, sign out everywhere).
- Optional Google OAuth.
- Password-reset requests delivered through the transactional outbox.
- Authenticator-app MFA for credential accounts, including recovery codes.
- Account profile image/name management, password management, “revoke all sessions,” and MFA management at `/account` and `/account/security`.
- JWT session-version invalidation after sensitive account operations.

Google OAuth users rely on the Google account's MFA policy; the application TOTP prompt applies to password authentication.

## Organisations and permissions

- Multiple organisations per user.
- `OWNER`, `ADMIN`, and `MEMBER` roles.
- Organisation profile, slug, description, and logo management.
- Member role changes and removals with owner-protection rules.
- Expiring, revocable organisation invitation links.
- Organisation deletion and audited administrative changes.

## Events

- Draft, published, and hidden event states.
- A single event publication state controls both public website visibility and RSVP availability.
- Title, description, tags, timezone, dates, location, online status, capacity, and cover image.
- Public, hidden-link, approval-required, and invite-only privacy modes; approval-required events can also be listed publicly (organisation page, Discover, search).
- Optional display of confirmed registration counts.
- Parallel programme tracks for rooms, stages, and streams; live delays cascade only within the affected track, while same-track time overlaps remain visible as organiser warnings.
- Event cloning, publishing, slug changes, and deletion.
- Verified email ownership is required before creating events, recurring series, clones, or event cover images.
- Private event and series email allowlists.
- Cover images are decoded, resized, metadata-stripped, and re-encoded to WebP before storage.

## Recurring series

- RRULE-based event series.
- Materialized event instances with their own RSVP lists.
- Series capacity, privacy, status, timezone, and invite management.

## Registration and RSVP lifecycle

- Guest registration by name/email and registration for signed-in users.
- Custom registration questions: text, textarea, email, phone, select, multiselect, radio, checkbox, number, and date.
- Required-field and option validation on the server.
- Duplicate RSVP prevention per event or instance.
- Capacity-aware confirmation and waitlisting.
- Pending approval, approval, rejection, cancellation, and waitlist promotion.
- Removing an RSVP creates a short-lived, server-owned undo snapshot.
- Confirmation and lifecycle emails are queued through a durable outbox.
- Confirmed RSVP emails include an `.ics` calendar invitation with the event or occurrence time and location.
- Event dashboard invitations are queued through the same durable outbox and link invitees to the event registration page.
- Organisation admins can email selected groups of existing registrations from the event's **Emails** tab: choose any combination of confirmed, waitlisted, pending-approval, and rejected registrations, optionally narrowed to people who did or did not check in. Thirteen starter templates (reminders, know-before-you-go logistics, agenda updates, speaker announcements, schedule or venue changes, cancellation, waitlist and approval updates, on-the-day notes, thank-you, missed-you, and slides/resources) prefill the subject, a rich-text message, and a suggested audience. The editor supports headings, bold/italic, lists, quotes, links, call-to-action buttons, and placeholders for `{{name}}`, `{{event}}`, `{{eventDate}}`, `{{location}}`, `{{eventUrl}}`, `{{ticketLink}}`, `{{feedbackUrl}}`, `{{scheduleUrl}}`, and `{{organisation}}`. Message HTML is reduced to a small sanitised subset on the server, a plain-text alternative is generated automatically, and the dashboard preview is rendered by the server with the real email template at desktop and mobile widths. Five visual designs (Classic, Minimal, Accent band in the event colour, Photo header with the event cover, and Letter) frame the same content; the choice is stored with each broadcast and used for the preview, tests and delivery. Organisers can send themselves a test, review the recipient count and subject in a confirmation step that must be ticked before sending, undo within five seconds, and reuse any previously sent email with its design. Each recipient is a separate outbox message rendered at delivery time, one per email address; ticket links are only inserted for confirmed registrations, and a registration that leaves the audience before delivery is skipped. Sends are rate limited and audited without recipient data.

## Tickets and check-in

- Opaque ticket/check-in tokens with QR and manual entry flows.
- Printable/downloadable attendee ticket.
- Organiser attendee lookup, direct check-in, and check-in undo.
- In-venue attendee badge printing after a QR, manual, or lookup check-in. With badge printing on, each check-in opens a quick print sheet showing that attendee's real badge with one Print button (Enter prints), Skip, and Edit design. The badge designer offers three high-contrast templates; badge-stock presets (A6, 4 × 6 in, 3 × 4 in, 4 × 3 in, CR80 ID card) in portrait or landscape plus custom sizes, with layouts and type that scale to the stock; card text with optional label and footer; email and organisation logo toggles; registration answers chosen from the sign-up form, reordered, and relabelled; long names that shrink to stay on one line; drag, arrow-key nudging and a properties panel for each item; undo/redo; previews with short and long sample names; a test-card print with sample data; and export/import of the design file to set up another desk. Every card includes the attendee's scannable check-in QR, generated locally. Designs are kept in the browser per event.
- Offline roster storage in the browser and later synchronization.
- Immutable check-in event history for online and offline actions.

Only eligible confirmed attendees receive a scannable ticket by default. Organisers can explicitly handle exceptional status cases where supported by the check-in workflow.

## Feedback and certificates

- Per-event feedback form with configurable title, thank-you message, open/closed state, and custom questions. Organisers can start from quick pulse, event review, or session-and-speaker-review templates, then tailor the form before opening it.
- When certificates are disabled, feedback is anonymous: no email or RSVP identity is collected, and repeat responses are allowed.
- When certificates are enabled, the submitted email must match a confirmed RSVP. Repeat submissions from the same email are allowed.
- Successful eligible submissions can download a generated JPEG certificate using an opaque token.
- Certificate designer: upload JPEG/PNG/WebP artwork (up to 5 MB), drag/resize the attendee-name area, choose from three fonts, and set size, color, bold, and alignment. Numeric placement controls support keyboard use. An exact server-generated preview checks font rendering and long-name fitting before saving feedback settings.
- Certificate layouts are snapshotted when feedback is submitted; subsequent layout edits affect new submissions only. Without custom artwork, the standard certificate is used.
- Feedback links are shared manually; opening a form does not automatically email attendees.

## Discovery and public pages

- Landing page, organisation pages, event pages, and recurring-instance pages.
- Public-event discovery with paginated, database-bounded search.
- Search by event title, tags, and organisation name.
- Public sitemap and crawler controls; ticket and administrative paths are not intended for indexing.

## Administration and operations

- Instance-wide super-admin area restricted by `SUPER_ADMIN_EMAIL`.
- Super-admin control to disable new password and Google account creation while preserving existing-user sign-in.
- Super-admin instance settings for SMTP delivery, Google SSO, and display-only backup posture; instance-managed service secrets are encrypted at rest and never displayed after saving.
- Read-only super-admin insights: 30-day activity and growth (signups, organisations, events, registrations, check-ins, feedback, broadcasts), email outbox health by message kind and recent broadcasts (subject and audience only), security posture (MFA adoption, owners/admins without MFA, unverified accounts, sign-in methods, sensitive audit actions, machine API clients with credential lifecycle but never secrets), storage breakdowns, and per-user and per-organisation support pages. Tokens, password and credential hashes, registration answers, storage keys, and message bodies are never shown.
- Separate TOTP step-up verification for super-admin access; verification lasts 10 minutes and requires an enrolled authenticator.
- Organisation, user, event, invitation, authentication, monitoring, operations, storage, and searchable audit-log views.
- Public liveness and secret-protected database readiness endpoints.
- Outbox delivery, retries, retention cleanup, scheduler-heartbeat monitoring, and safe failed-email diagnostics.
- Private S3-compatible object storage with database asset accounting.
- Application audit events plus database-triggered fallback audit records for important mutations.
- Owner-managed, tenant-bound machine API clients with explicit scopes, one-time credentials, expiry, rotation, revocation, and disablement.
- Versioned machine endpoints for standalone event metadata and minimal confirmed-participant rosters, including attendance filtering and separately scoped check-in timestamps.
