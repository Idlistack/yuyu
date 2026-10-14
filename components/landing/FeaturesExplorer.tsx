import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Feature areas. `highlights` are the short design bullets; `details` keeps
 * the complete capability list behind "More detail" so nothing is lost.
 */
const featureAreas = [
  {
    id: "events",
    title: "Events & registration",
    summary: "From a simple public RSVP to an approval-only gathering.",
    tint: "bg-highlight-mint",
    highlights: ["Draft, published and hidden states", "Public, hidden-link, approval and invite-only modes", "Custom RSVP forms with 10 field types", "Guest or signed-in registration with duplicate protection"],
    details: [
      "Draft, published, and hidden event states with a controlled publishing workflow.",
      "Event details for dates, timezone, location, online attendance, tags, capacity, descriptions, and safe cover images.",
      "Public, hidden-link, approval-required, and invite-only privacy modes.",
      "Configurable visibility for confirmed registration counts.",
      "Cloning, slug updates, deletion, and private email allowlists.",
      "Custom RSVP forms with text, textarea, email, phone, select, multiselect, radio, checkbox, number, and date fields.",
      "Guest and signed-in registration with server-side validation and duplicate-RSVP protection.",
    ],
  },
  {
    id: "series",
    title: "Recurring series",
    summary: "Run repeat events without rebuilding them each time.",
    tint: "bg-highlight-lavender",
    highlights: ["Timezone-aware recurring schedules", "Each date keeps its own RSVPs and attendance", "Series-level capacity, privacy and invites", "Parallel tracks with cascading live delays"],
    details: [
      "RRULE-based recurring event series with timezone-aware schedules.",
      "Materialized instances, each with its own RSVP list and attendance state.",
      "Series-level capacity, privacy, status, and invite management.",
      "Parallel programme tracks for rooms, stages, and streams, with independent cascading live delays.",
      "Public programme, session, and speaker pages for released event websites.",
    ],
  },
  {
    id: "rsvp",
    title: "RSVPs & invitations",
    summary: "Every registration state, clear for guests and organisers.",
    tint: "bg-highlight-peach",
    highlights: ["Capacity, waitlists, approvals and cancellations", "Automatic waitlist promotion", "Reliable confirmation emails with calendar files", "CSV export and manual registrations"],
    details: [
      "Capacity-aware confirmation, waiting lists, pending approval, approval, rejection, and cancellation.",
      "Automatic waitlist promotion after a cancellation, plus organiser override flows where supported.",
      "Short-lived server-owned RSVP undo snapshots for safe corrections.",
      "Transactional confirmation and lifecycle email through a durable retrying outbox.",
      "Event, series, collaborator, and organisation invitations with revocable/expiring links.",
      "Attendee management, CSV/email export, and manual registrations for event staff.",
    ],
  },
  {
    id: "checkin",
    title: "Tickets & door check-in",
    summary: "Keep the queue moving, securely.",
    tint: "bg-highlight-mint",
    highlights: ["QR tickets with no personal data in the code", "Camera scanning, search and undo", "Offline check-in that syncs later", "PIN-protected volunteer station and ID cards"],
    details: [
      "Opaque attendee ticket and check-in capabilities with QR and manual-entry flows.",
      "Printable and downloadable attendee tickets for eligible confirmed guests.",
      "Camera scanning, attendee lookup, direct check-in, undo, and a PIN-protected venue station.",
      "Offline roster download, offline check-in queueing, and later synchronization from the dashboard.",
      "Immutable online and offline check-in event history.",
      "Browser-printable ID cards with event branding, attendee fields, and a scannable check-in QR code.",
    ],
  },
  {
    id: "feedback",
    title: "Feedback & certificates",
    summary: "Close the loop without compromising privacy.",
    tint: "bg-highlight-lavender",
    highlights: ["Custom feedback forms per event", "Anonymous mode", "Certificates only for confirmed guests", "Designed certificate templates"],
    details: [
      "Per-event feedback forms with custom questions, title, thank-you message, and open/closed controls.",
      "Anonymous feedback mode with no RSVP identity collection and repeat responses allowed.",
      "Certificate-enabled feedback that verifies a confirmed RSVP before issuing a credential.",
      "Downloadable JPEG certificates delivered through an opaque one-time capability.",
    ],
  },
  {
    id: "public",
    title: "Public pages & discovery",
    summary: "A polished presence people can actually find.",
    tint: "bg-highlight-peach",
    highlights: ["Event websites with programme, speakers and FAQ", "Search by title, tag or organisation", "Open Graph and sitemap coverage", "Embeddable event cards"],
    details: [
      "Landing, organisation, event, recurring-instance, and event-website pages.",
      "Event website content for highlights, speakers, sponsors, resources, FAQs, and programme sessions.",
      "Public discovery with bounded pagination and search by event title, tag, or organisation.",
      "Sitemap, metadata, Open Graph coverage, and crawler controls that keep sensitive routes out of indexes.",
      "Private application-controlled delivery for processed event cover images and assets.",
    ],
  },
  {
    id: "teams",
    title: "Accounts & teams",
    summary: "Collaborate without crossing boundaries.",
    tint: "bg-highlight-mint",
    highlights: ["Multiple organisations per account", "Owner, admin and member roles", "Per-event co-organisers", "Authenticator MFA and session revocation"],
    details: [
      "Multiple organisations per account with owner, admin, and member roles.",
      "Organisation profiles, logos, slugs, member changes, removals, and protected ownership rules.",
      "Email/password accounts, verified email ownership, optional Google sign-in, and password reset.",
      "Authenticator-app MFA, recovery codes, account profile controls, and revoke-all-sessions protection.",
      "JWT session-version invalidation following sensitive account actions.",
    ],
  },
  {
    id: "security",
    title: "Security & operations",
    summary: "Production-minded by default.",
    tint: "bg-highlight-lavender",
    highlights: ["Strict tenant isolation", "Private storage with image re-encoding", "Append-only audit records", "Rate limits and step-up for admins"],
    details: [
      "Strict organisation tenant isolation and server-side role/permission enforcement.",
      "Private S3-compatible storage with cover-image validation, metadata stripping, and WebP re-encoding.",
      "Append-only application audit events plus database-triggered fallback audit records.",
      "Super-admin TOTP step-up, searchable operations/audit views, encrypted write-only service settings, and account-creation controls.",
      "Protected readiness checks, outbox retries, retention cleanup, scheduler heartbeat monitoring, and safe failed-email diagnostics.",
    ],
  },
  {
    id: "api",
    title: "Machine API",
    summary: "Integrate without sharing user accounts.",
    tint: "bg-highlight-peach",
    highlights: ["Scoped, expiring, rotatable credentials", "Read events and confirmed participants", "Separate attendance scope", "Secrets shown only once"],
    details: [
      "Tenant-bound API clients with explicit scopes, expiry, rotation, revocation, and disablement.",
      "One-time bearer credentials that are never stored or shown again after creation.",
      "Versioned endpoints for event metadata and minimal confirmed-participant rosters.",
      "Separate attendance and check-in timestamp scopes with deliberately limited DTOs.",
    ],
  },
] as const;

export function FeaturesExplorer() {
  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-14 px-4 pb-[72px] pt-12 sm:px-6 md:pt-16">
      <section className="flex max-w-[760px] flex-col items-start gap-[18px]">
        <h1 className="text-display-l text-ink">
          Everything you need to run great <span className="yy-highlight box-decoration-clone">free events.</span>
        </h1>
        <p className="text-body-l text-ink-secondary">From the first RSVP to a post-event certificate — a secure, self-hosted workspace for the whole event lifecycle.</p>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild variant="primary" size="md">
            <Link href="/login">Start organising — free</Link>
          </Button>
          <Button asChild variant="secondary" size="md">
            <Link href="/discover">Explore events</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-10 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Feature areas" className="hidden md:block">
          <div className="sticky top-24 flex flex-col gap-0.5">
            <p className="px-3 pb-2 text-overline text-ink-muted">{featureAreas.length} areas</p>
            {featureAreas.map((area) => (
              <a key={area.id} href={`#${area.id}`} className="rounded-md px-3 py-2 text-[15px] font-medium text-ink-secondary transition-colors hover:bg-emphasis hover:text-ink">
                {area.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="flex flex-col gap-3.5">
          {featureAreas.map((area, index) => (
            <section key={area.id} id={area.id} aria-labelledby={`${area.id}-title`} className="scroll-mt-24 rounded-xl border border-line bg-canvas p-6">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.23fr)]">
                <div className="flex flex-col gap-1.5">
                  <span aria-hidden className={`flex size-10 items-center justify-center rounded-md font-display text-base font-extrabold text-ink ${area.tint}`}>{index + 1}</span>
                  <h2 id={`${area.id}-title`} className="pt-1 text-h3 text-ink">{area.title}</h2>
                  <p className="text-body text-ink-secondary">{area.summary}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {area.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-start gap-2.5 text-body text-ink">
                      <Check aria-hidden className="mt-[3px] size-[18px] shrink-0 text-success-fg" strokeWidth={2.5} />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <details className="group mt-4 border-t border-line pt-3">
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink-secondary hover:text-ink [&::-webkit-details-marker]:hidden">
                  More detail
                  <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-body-ui text-ink-secondary marker:text-ink-muted">
                  {area.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </details>
            </section>
          ))}
        </div>
      </div>

      <section className="flex flex-col items-start gap-6 rounded-3xl bg-inverse p-8 sm:p-11 md:flex-row md:items-center md:justify-between">
        <h2 className="font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.02em] text-on-inverse sm:text-[40px]">Ready to make your next event easier?</h2>
        <Button asChild variant="inverse" size="lg">
          <Link href="/login">Get started with Yuyu</Link>
        </Button>
      </section>
    </div>
  );
}
