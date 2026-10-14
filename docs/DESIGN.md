# Yuyu Design System — agent brief

> Read this before building or changing any Yuyu UI. It is the source of truth for how Yuyu looks and behaves.
> Visual reference: Figma file **Yuyu — Light screens** (pages "Light screens" and "Dark screens"):
> https://www.figma.com/design/oVuNh4VRXQ9fIpdnUCoZqt
> Design system (tokens.json, reference CSS, component previews): https://claude.ai/artifact/ByW8SYP7tb7yyLUwgHu3tz

---

## 1. What Yuyu is, and what the design must do

Yuyu is a free, open-source, self-hostable platform for running **free** community events (no tickets, payments or ad trackers). Most organisers are volunteers and small groups — clubs, meetups, NGOs, campus groups — not ops teams. Most attendees open an event link on a phone.

The design direction is called **A+ ("Commons, refined")**:

1. **Welcoming, like a neighbourhood.** Plain words, generous spacing, rounded shapes, friendly type. Never feels like an admin console.
2. **Yuyu steps back; the event leads.** Yuyu's own chrome is quiet neutrals. On event-facing pages the organiser's **accent colour, cover and logo** carry the identity.
3. **Bold only where it earns it.** Big tight display type and colour moments are reserved for: event titles, the ticket, success states (you're in, checked in, certificate), and Yuyu's own marketing pages. Dashboards and forms stay calm.
4. **Simple for volunteers.** One obvious primary action per view. Destructive actions are visually distinct and confirm before acting.
5. **Accessible by default.** WCAG AA contrast, real form controls, keyboard reachable, works at 360px wide.

---

## 2. Design tokens

All values below exist as CSS custom properties (see §9). **Never hard-code a hex in a component** — use a token.

### 2.1 Colour — neutrals (light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--yy-bg-canvas` | `#FFFFFF` | `#111113` | Page background, cards |
| `--yy-bg-subtle` | `#FAFAF9` | `#18181B` | App sidebar, kiosk background, quiet panels |
| `--yy-bg-muted` | `#F4F4F2` | `#232326` | Neutral chips, stat fills, map placeholders |
| `--yy-bg-emphasis` | `#EFEEEA` | `#2A2A2E` | Selected nav item, hover fills |
| `--yy-bg-track` | `#F0EFEB` | `#2A2A2E` | Progress-bar tracks |
| `--yy-border` | `#E7E6E2` | `#2A2A2E` | Card borders, dividers |
| `--yy-border-strong` | `#D4D3CE` | `#3F3F46` | Inputs, secondary buttons, dashed empty states |
| `--yy-text` | `#18181B` | `#F4F4F5` | Primary text |
| `--yy-text-secondary` | `#3F3F46` | `#D4D4D8` | Body copy under headings |
| `--yy-text-muted` | `#5F5E5A` | `#A1A1AA` | Meta, captions, helper text (passes AA on canvas) |
| `--yy-text-disabled` | `#A1A09A` | `#71717A` | Disabled labels only (not for readable content) |

### 2.2 Colour — Yuyu primary ("ink")

Yuyu's own primary action is ink, not a hue. It inverts in dark mode.

| Token | Light | Dark |
|---|---|---|
| `--yy-primary` | `#18181B` | `#F4F4F5` |
| `--yy-on-primary` | `#FFFFFF` | `#18181B` |
| `--yy-inverse-surface` (feature bands, kiosk camera) | `#18181B` | `#1C1C1F` |

### 2.3 Colour — brand

The Yuyu logo tile is a 135° gradient **`#7EE8C4 → #B9AEFF`** (mint → lavender) with an ink "Y". Mint and lavender appear **only** in the logo, and as soft tints on Yuyu's own pages (home, about, features, sign-in). They are never used for buttons or status.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--yy-brand-mint` | `#7EE8C4` | `#7EE8C4` | Logo gradient start |
| `--yy-brand-lavender` | `#B9AEFF` | `#B9AEFF` | Logo gradient end |
| `--yy-highlight-mint` | `#BDF3DF` | `#1F4D3D` | Highlighter mark under a display word |
| `--yy-highlight-lavender` | `#DCD6FF` | `#332E5C` | Same, alternate |
| `--yy-highlight-peach` | `#FDE7C8` | `#4A3418` | Step number circles |
| `--yy-tint-mint` | `#E9FBF3` | `#10261E` | Feature/principle cards, sign-in panel |
| `--yy-tint-lavender` | `#F1EFFF` | `#1C1A33` | Same |
| `--yy-tint-peach` | `#FFF4E5` | `#2A1F10` | Same |

### 2.4 Colour — status

Status always pairs a **soft background** with a **strong foreground**, plus an icon or word (never colour alone).

| Status | bg (L / D) | fg (L / D) | solid (L / D) | Used for |
|---|---|---|---|---|
| Success | `#DCFCE7` / `#13301F` | `#166534` / `#86EFAC` | `#15803D` | Going, Published, Checked in, Verified, Online |
| Warning | `#FEF3C7` / `#33270B` | `#92400E` / `#FCD34D` | `#F59E0B` | Waitlist, Draft, Running late, Reminders, MFA off |
| Danger | `#FEE2E2` / `#3A1414` | `#B91C1C` / `#F87171` | `#B91C1C` | Delete, Invalid ticket, Cancelled, errors |
| Danger border | `#FCA5A5` / `#7F1D1D` | — | — | Danger-zone card outline |
| Neutral | `--yy-bg-muted` | `--yy-text-secondary` | — | In person, Online, Owner, Recurring, tags |

### 2.5 Colour — event accent (organiser theming)

Every **event** and **organisation** has an accent colour (stored on the event, e.g. `Event.accentColor` — check `prisma/schema.prisma` and add a reviewed migration if it doesn't exist yet; an organisation without one falls back to ink `#18181B`). On event-facing pages the accent drives:

- Event title (display type), Register/primary button, date-block header, progress fill, active section-nav underline, accent chips, speaker initials.

Derived tokens, computed at render time and set as CSS variables **on the event page root**:

| Token | Formula |
|---|---|
| `--yy-accent` | organiser value (validated hex) |
| `--yy-accent-soft` | `color-mix(in srgb, var(--yy-accent) 8%, var(--yy-bg-canvas))` in light, `14%` in dark (Ember → `#FAF0EC` / `#2A1812`). Keeps accent-text on it ≥ 4.5:1 |
| `--yy-on-accent` | `#FFFFFF` if contrast(accent, white) ≥ 4.5, else `#18181B` |
| `--yy-accent-text` | Light: accent if contrast(accent, canvas) ≥ 4.5, else darken until it passes. Dark: `color-mix(in srgb, var(--yy-accent) 65%, #FFFFFF)` and check ≥ 4.5 on `#111113` |

**Contrast guard (required):** organisers can pick any colour, so always compute `--yy-on-accent` and `--yy-accent-text`, and check `--yy-accent-text` against both the canvas and `--yy-accent-soft` (≥ 4.5:1 for chip text). Never put white text on a light accent. Note: White on the success solid `#15803D` is 5.0:1, so all kiosk panel text stays readable.

Preset swatches offered in the colour picker:

| Name | Hex | Dark accent-text |
|---|---|---|
| Ember (default for new events) | `#C2410C` | `#FB8A5B` |
| Iris | `#4B3FA8` | `#A79BFF` |
| Teal | `#0F766E` | `#5EEAD4` |
| Ink | `#18181B` | `#F4F4F5` |

Yuyu chrome (app shell, Yuyu marketing pages, auth) **never** uses an event accent. In the dashboard, an event's accent appears only on its own date block and progress bar.

### 2.6 Typography

| Role | Family | Fallback |
|---|---|---|
| Display / headings | **Bricolage Grotesque** (variable, opsz) — weights 600, 800 | `ui-sans-serif, system-ui, sans-serif` |
| Body / UI | **Figtree** — 400, 500, 600, 700 | `system-ui, sans-serif` |
| Code / IDs / API | **JetBrains Mono** — 400, 500 | `ui-monospace, monospace` |

Self-host fonts (privacy invariant: no third-party font CDNs at runtime). Use `next/font/local` or `@fontsource`.

Type scale (desktop → mobile ≤ 640px):

| Token | Family / weight | Size / line-height | Tracking | Mobile | Used for |
|---|---|---|---|---|---|
| `display-xl` | Bricolage 800 | 76 / 0.98 | −0.035em | 44 | Yuyu home hero |
| `display-l` | Bricolage 800 | 64–72 / 0.98–1.0 | −0.03em | 40 | Event title, About/Features hero |
| `display-m` | Bricolage 800 | 52–56 / 1.0 | −0.03em | 36 | Page titles on public pages, Feedback "How was it?" |
| `h1` | Bricolage 800 | 38–40 / 1.1 | −0.02em | 30 | Dashboard page title |
| `h2` | Bricolage 800 | 30–32 / 1.15 | −0.01em | 24 | Event page section (Schedule, Speakers) |
| `h3` | Bricolage 800 | 24 / 1.2 | 0 | 20 | Card titles, feature areas |
| `h4` | Bricolage 800 | 20 / 1.25 | 0 | 18 | Dashboard section titles |
| `body-l` | Figtree 400 | 18–20 / 1.6 | 0 | 17 | Lead paragraphs |
| `body` | Figtree 400 | 16 / 1.6 | 0 | 16 | Default copy (public) |
| `body-ui` | Figtree 400/500 | 15 / 1.5 | 0 | 15 | Dashboard default |
| `label` | Figtree 600 | 14 / 1.4 | 0 | 14 | Form labels, table headers |
| `caption` | Figtree 400 | 13–14 / 1.45 | 0 | 13 | Helper text, timestamps |
| `overline` | Figtree 700 | 13 / 1.3 | 0.06em, UPPERCASE | 12 | "VENUE", "ON THIS PAGE" |
| `mono` | JetBrains Mono 400 | 13 / 1.5 | 0 | 13 | Codes, endpoints, scopes |

Rules: never tighter than −0.035em (letters must not touch). Body copy max width ~640px. Don't use Inter, Roboto or Arial.

### 2.7 Spacing

4px base. Use only: `2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80`.

| Context | Value |
|---|---|
| Inline gaps (icon + label, chips) | 6–10 |
| Form field gap | 12–14 |
| Card padding | 16–24 (dashboard 16–20, public 24–32) |
| Section gap (dashboard) | 24 |
| Section gap (event page) | 40–48 |
| Section gap (marketing) | 64–80 |
| Page side gutter | 24 desktop, 16 mobile |
| Content max-width | 1160 public; dashboard fluid with forms ≤ 900 |

### 2.8 Radius

| Token | px | Use |
|---|---|---|
| `r-sm` | 8 | Inline code buttons, tiny controls |
| `r-md` | 10–12 | Inputs, date block, nav items, org avatar small |
| `r-lg` | 16 | Cards, list rows, tables, stat tiles |
| `r-xl` | 20 | Feature cards, registration card, cover image |
| `r-2xl` | 24–28 | Hero panels, ticket, kiosk result panel, CTA bands |
| `r-full` | 999 | **All buttons**, chips, segmented controls, search fields, avatars |

Don't nest more than two rounded containers (card inside card inside card is banned).

### 2.9 Elevation

Flat by default: cards use a 1px `--yy-border`, no shadow.

| Token | Value (light) | Dark | Use |
|---|---|---|---|
| `shadow-raised` | `0 1px 2px rgba(24,24,27,.04), 0 12px 32px rgba(24,24,27,.06)` | `0 12px 32px rgba(0,0,0,.5)` | Event registration card, auth card |
| `shadow-float` | `0 1px 2px rgba(24,24,27,.04), 0 24px 48px rgba(24,24,27,.08)` | `0 24px 48px rgba(0,0,0,.5)` | Hero product mock, menus, dialogs |
| `shadow-ticket` | `0 1px 2px rgba(24,24,27,.06), 0 16px 40px rgba(24,24,27,.10)` | same, black | Ticket stub |

### 2.10 Motion

- Durations: 120 (press), 180 (hover/fade), 240 (panels, dialogs), 360 (success moments).
- Easing: `cubic-bezier(.2,.8,.2,1)`.
- **Content is visible by default.** Scroll-reveal animations may only enhance, never hide content (fixes the blank sections on v1 Home/About).
- Respect `prefers-reduced-motion: reduce` → no translate/scale, fades ≤ 120ms.
- Success moments (Registered, Checked in): a single 360ms scale-in of the check icon; no confetti.

### 2.11 Breakpoints

`sm 640` · `md 960` · `lg 1200`. Mobile-first. Two-column layouts (content + side card) stack below `md`, side card first on event pages only for the Register card (see §5.2).

---

## 3. Iconography & imagery

- Icons: 1.8–2px stroke, rounded caps/joins, 16/18/20/24px. Use Lucide (`lucide-react`) to match. Decorative icons get `aria-hidden="true"`; icon-only buttons need `aria-label`.
- No emoji in UI.
- Event cover: 16:7 (event page), 2:1 (cards). If none is uploaded, draw a placeholder from the accent: solid accent + 22–24px dot grid at 16–18% white. Never show a broken image.
- Avatars: photo if present, else initials (1–2 letters, 700 weight) on a tint: `--yy-accent-soft` on event pages; status tint in activity feeds; `--yy-bg-emphasis` for users.
- Organisation logo: square, radius 9–28 depending on size; fallback = initials on the org accent.
- Logos of sponsors: real logo in a 40×40 tile; fallback dashed tile. Never repeat the name twice.

---

## 4. Components

Each lists anatomy, variants, sizes and rules. Names match the Figma layers and suggested React components.

### 4.1 Button

Pill shape (`r-full`), Figtree 600–700.

| Variant | Light | Dark | When |
|---|---|---|---|
| `primary` | bg `--yy-primary`, text `--yy-on-primary` | inverted | One per view: Save, Create, Sign in |
| `accent` | bg `--yy-accent`, text `--yy-on-accent` | same | Event-facing primary: Register, Send feedback |
| `secondary` | bg canvas, 1px `--yy-border-strong`, text `--yy-text` | same tokens | Second action: Cancel, Share, Add to calendar |
| `quiet` | no bg/border, text `--yy-text-secondary`, underline on hover | — | Tertiary: Back, Undo, Forgot? |
| `danger` | bg canvas, 1.5px danger, text danger | — | Delete organisation…, Sign out everywhere |
| `danger-quiet` | text danger only | — | Revoke, Turn off station |
| `inverse` | bg white, text ink | bg `#F4F4F5` | On ink bands (CTA band) |

Sizes: `sm` 36px (14px text, 7×14 padding) · `md` 44px (15–16px, 10×18) · `lg` 52px (17px, 14×24). Minimum touch target 44px on touch screens. Kiosk keys 76px.

Rules: destructive actions are never `primary`; destructive confirmations end with "…" and open a dialog. Disabled = `--yy-bg-emphasis` bg, `--yy-text-muted` text, still readable. Loading = keep width, swap label for spinner + "Saving…".

### 4.2 Text input / textarea / select

- Label **above** the field (Figtree 600 14px), never a floating label. Optional fields say "Optional" in muted text, required fields don't need an asterisk unless most fields are optional.
- Field: 1px `--yy-border-strong`, `r-md` 12px, padding 11–12 × 14, 16px text (prevents iOS zoom), canvas bg.
- Helper text under field: 13px muted. Error: border danger, helper text danger with icon, `aria-invalid` + `aria-describedby`.
- Focus: 2px ring `--yy-primary` (or `--yy-accent` on event pages) with 2px offset.
- Read-only values (email you can't change, web address): `--yy-bg-subtle` fill, 1px `--yy-border`, lock icon, optional "Copy".
- Prefix fields: grey prefix segment (`yuyu.idliapps.com/`) joined to the input.
- Search: pill shape, leading search icon, clear (✕) button.
- Password: inline show/hide icon button inside the same border; strength bar (4 segments) + rule checklist.
- Textarea resizes vertically; no grey box inside the field (v1 bug).

### 4.3 Choice controls

- **Chip toggle / filter chip:** pill, 1px border; selected = 1.5px ink border + ink fill + white text (or outline-only for "radio-like" groups). `aria-pressed`.
- **Segmented control:** pill track `--yy-bg-muted`, 4px padding, selected segment white with `shadow` `0 1px 3px rgba(24,24,27,.12)`. Used for Sign in / Create account, List / Calendar, Page content / Programme.
- **Checkbox card:** for options with descriptions (API scopes). Selected = 1.5px ink border.
- **Switch:** for instant settings (Let waitlisted guests in, Print ID cards). Label + description left, switch right, whole row clickable.
- **Rating 1–5:** five equal buttons with number + word (Poor, Meh, Okay, Good, Loved it); selected = 2px accent border + accent-soft fill.
- **PIN input:** 8 boxes 44×60, current box 2px ink border; on kiosks pair with a 3×4 keypad (Clear, 0, ⌫).

### 4.4 Tabs & navigation

- **Underline tabs** (page sub-sections): 2px bottom border on active (ink in app, accent on event page), muted text inactive, horizontal scroll on overflow. Max 8 tabs.
- **Section nav** on event page: About · Schedule · Speakers · Venue · FAQ, anchors.
- **Breadcrumb:** `Event / Programme`, 15px, parent links 600 weight.
- **Back link:** `← All events`, quiet, 14px 600.

### 4.5 Chips / badges

Pill, 12–13px, 600–700, padding 3–5 × 10–12. Types: status (§2.4), accent (accent-soft bg + accent-text), neutral (muted bg). One word where possible: Going, Waitlist, Draft, Published, Free, In person, Online, Weekly.

**Naming:** recurring events are always called **"Series"** in the dashboard and **"Every Tuesday" / "Weekly"** to attendees. Don't mix "Recurring" and "Series".

### 4.6 Date block

The signature element. 50–68px wide, `r-md`, 1px border, overflow hidden.
- Top band: month (`OCT`), 11–12px 700, 0.08em tracking, white on accent (event) or neutral `#A1A09A` for drafts.
- Bottom: day number, Bricolage 800, 20–30px.
Used on: event cards, dashboard rows, event header, ticket, embed. Optional series variant: repeat icon instead of date.

### 4.7 Cards

- **Base card:** canvas bg, 1px border, `r-lg`, padding 16–24. Clickable cards are a single `<a>` with hover bg `--yy-bg-subtle`.
- **Event card (grid, discover):** cover band 150px in accent with date block overlapping the bottom-left by 22px; chips; title (Bricolage 800 22px); "Wed 14 Oct · 9:30 AM · Bengaluru"; footer row: org · "5 going".
- **Event row (dashboard, org page):** date block · title + one-line meta · right side status/going + mini progress bar. Drafts use a dashed border and a "Finish & publish" warning chip.
- **Stat tile:** label (14px muted) over number (Bricolage 800 32–34px); optional progress bar; optional tinted "needs you" variant.
- **Feature/principle card:** tint bg, no border, `r-xl`, padding 24.
- **Callout / banner:** warning tint, icon, bold first sentence, single action link/button at the right. One per page max.
- **Empty state:** 1.5px dashed `--yy-border-strong`, centered text, a next step ("Copy the invite link above to bring in your team.").
- **Danger zone:** 1.5px `--yy-danger-border` outline card at the bottom of settings, title in danger fg, `danger` button.

### 4.8 Lists & tables

- Tables: rounded container `r-lg` with 1px border, header 13px 600 muted, rows 12–14px padding, 1px `#EFEEEA` separators, horizontal scroll wrapper on small screens. Person cell = avatar + name + email (never repeat the email twice).
- Timestamps: relative for < 7 days ("2 min ago", "Yesterday"), else "13 Oct 2026".
- Undo actions in tables are `quiet` buttons, not coloured links.

### 4.9 Schedule / programme

- **Schedule list (event page):** rows: time (700) + duration (muted) · title link (700 18px) + speakers · track chip (accent for primary track, neutral for others).
- **Programme grid:** time column 96px + one column per track; sessions as tinted blocks spanning rows (accent-soft for main track, muted for others); breaks span all tracks; empty slots dashed. Track filter chips on top. Times in event timezone, labelled once ("all times IST").
- **Live schedule:** NOW card (accent fill, white text, progress bar, "4 min left") · NEXT card with delay chip ("Running 5 min late", old time struck through) · LATER list. "Live · updates automatically" badge.
- **Programme editor:** tracks as reorderable chips with edit buttons + "Add track"; each track a column of session cards with a "Running late?" − / + stepper ("On time", "+5 min").

### 4.10 Event registration card

Right column on desktop (sticky top 24px), below title on mobile **plus a sticky bottom bar** with the Register button once the card scrolls away.
Contents: "Join this event" (h3) · "5 going / 115 spots left" + progress bar (accent) · avatar stack + "Meera, Dev and 3 others" · accent button "Register — it's free" · secondary row Add to calendar / Share · host row (org logo, "Hosted by", name, →).
States: Open · Full ("Join the waitlist", warning) · Approval required ("Request to join") · Closed ("Registration closed", disabled + reason) · Registered ("You're in" success + View ticket).

### 4.11 Ticket

Phone-first. Heading "You're in, {firstName}!" (display, 34px). Stub card `r-2xl` + `shadow-ticket`: accent header (org name 13px, event title Bricolage 800 28px) · 2-col detail grid (DATE, TIME, VENUE, GUEST with overline labels) · perforation (dashed line + two half-circle notches in page bg) · QR on **white plate always** (also in dark mode) + "Show this at the door. It only holds a private ticket link." Actions: Add to calendar (primary), Save ticket (secondary), "Can't make it? Cancel registration" (quiet).

### 4.12 Check-in

- **Station (kiosk, tablet, no site chrome):** header with event, "Station 1", count "3 / 5 checked in", Online/Offline badge, Lock station. Left: camera viewfinder (dark, corner brackets, hint text) + search pill + Find. Right: **full-height result panel**:
  - Success: `#15803D` fill, check icon, "Checked in", name in display type, Next guest (inverse) + Undo.
  - Waitlisted: warning tint + 2px amber border, "On the waitlist", guidance, "Admit anyway" + Next guest.
  - Invalid: `#B91C1C` fill, ✕ icon, plain-language reason, "Scan again".
  - Below: RECENT list.
- **PIN lock:** left copy ("Enter the station PIN"), right keypad. Open check-in disabled until 8 digits.
- **Organiser check-in desk (dashboard tab):** progress tile, offline-readiness callout ("Download guest list"), camera + search, switches, recent check-ins table, Door-station card (QR, Copy link, Show PIN, New PIN, Turn off station).

### 4.13 App shell (dashboard)

- **Sidebar** 240px, `--yy-bg-subtle`, right border. Top: Yuyu logo. Two modes:
  - *Outside an org:* Home · ORGANISATIONS list (logo + name) · + New organisation.
  - *Inside an org:* org switcher (logo, name, role, ⇅) · Events · Series · Members · Settings (sub: General, API access).
  - Bottom: user (initials) → Account, Sign out; "View public page ↗".
  - Active item: `--yy-bg-emphasis` fill, 600 weight, `aria-current="page"`.
  - Below `md`: sidebar collapses to a top bar + menu sheet.
- **Event/series header:** ← All events · date block + title (h1 32px) + status chip + "Public · Tomorrow, 9:30 AM" · actions (View page ↗ secondary, Open check-in primary) · underline tabs: Overview, Guests, Page & programme, Registration form, Invites, Check-in, Feedback, Settings.
- Page title pattern: optional greeting/kicker (muted) + h1 + one-line description.
- Settings pages: left label column (title + helper) / right field column rows separated by dividers; Save/Discard bottom-right.

### 4.14 Public chrome

- **Yuyu site header** (home, about, features, discover, legal): logo · Discover · Features · About (active = muted pill) · right: Sign in (secondary) + Start organising (primary). Footer: logo + "Free events, run by communities." · links · "Built by Abhiram · Hosted on Idlistack".
- **Event-context header** (event, programme, session, speaker, series, feedback, org page): **organiser** logo + name on the left (not Yuyu); right: Discover events + Sign in, or an accent "Register — free" on sub-pages. Footer: small Yuyu mark + "Free event, powered by Yuyu" · Privacy · Terms.
- "Powered by Idlistack" lives in the footer only — never in the top nav.
- **Auth pages:** minimal header (logo only), centered card `r-2xl` max 440–480px, or split layout on sign-in (form left, mint-tint brand panel right).

### 4.15 Dialogs, toasts, menus

- Dialog: `r-2xl`, `shadow-float`, max 480px, title (h3) + body + actions right-aligned (secondary then primary/danger). Destructive dialogs require typing the name for org deletion.
- Toast: bottom-center (mobile) / bottom-left (desktop), ink bg, white text, 4s, optional Undo action.
- Menu (⋯): `r-lg`, `shadow-float`, items 40px, danger items last in danger fg.

---

## 5. Page patterns

### 5.1 Inventory

| Area | Screens |
|---|---|
| Yuyu's own pages | Home, About, Features, Privacy, Terms |
| Discover & orgs | Discover (search + filters), Organisation public page (list/calendar), Embeddable event card (520×300) |
| Attending | Event page, Programme, Session, Speaker, Series date (RSVP), Live schedule, Feedback & certificate, Ticket, Station PIN, Station scanning |
| Auth & account | Sign in / Create account, Set new password, Verify email, Join organisation, Co-organiser invite, Account profile, Account security |
| Workspace | Workspace home, Organisation events, Create organisation, Members, Organisation settings, API access |
| Event management | Event overview, Check-in desk, Programme editor, Series manage |
| Not yet designed — follow this system | Create event / series flow, Event settings, Guests list, Registration form builder, Page content editor, Feedback builder/results, Certificate designer, Analytics, Invites, ID card print, Super-admin, emails, error/empty/404 |

### 5.2 Event page layout

1. Organiser header.
2. Cover (16:7, `r-xl`) or nothing — never a broken placeholder in production.
3. Two columns ≥ 960: left content (chips → title in accent display → tagline → date block + venue rows → section nav → About + highlight tiles → Schedule → Speakers → Partners → Venue (map + directions) → FAQ (`<details>`) → Resources); right sticky registration card + host card.
4. Mobile: title block → registration card → sections; sticky bottom Register bar.

### 5.3 Dashboard home & lists

Greeting + h1 · warning callout if something needs attention · 4 stat tiles · two columns: event rows (tabs Upcoming / Drafts n / Past) and Recent activity.

---

## 6. Content & voice

- Plain, warm, short. Second person. Sentence case everywhere (buttons, headings, tabs).
- Name the action: "Register — it's free", "Save new password", "Download guest list" — not "Submit", "OK".
- Say what happens next: "We'll send your ticket and the call link here."
- Errors: what went wrong + how to fix, no blame: "This code isn't for Demo Summit. Try searching by name instead."
- Never show raw internals: no RRULE strings, no full secret URLs, no seconds in times, no `10/14/2026`.
- Use "organisation", "organiser" (en-GB spelling, as in the codebase).
- Don't over-promise legal/privacy claims beyond what the system enforces.

### 6.1 Dates & times (one formatter)

All formatting goes through one helper (e.g. `lib/format/datetime.ts`) using the **event's timezone**, `Intl.DateTimeFormat`, and these named styles:

| Style | Example |
|---|---|
| `dateBlock` | `OCT` / `14` |
| `dayLong` | Wednesday, 14 October |
| `dayShort` | Wed 14 Oct |
| `time` | 9:30 AM |
| `timeRange` | 9:30 AM – 5:30 PM IST (date shown once if same day) |
| `relativeDay` | Today / Tomorrow / In 9 days / Every Tuesday |
| `relativeTime` | 2 min ago / Yesterday / 13 Oct 2026 |

Show the timezone abbreviation once per page/section, not on every row. Never show seconds. Never output US `MM/DD/YYYY`. Countdown timers in lists are banned; use `relativeDay`.

---

## 7. Accessibility checklist

- Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 24px). `--yy-text-muted` is the lightest allowed body text.
- Status never by colour alone (word or icon too).
- Every input has a `<label>`; errors linked with `aria-describedby`.
- Interactive elements are real `<button>` / `<a href>`; tabs use `role="tab"` + `aria-selected`; toggles use `aria-pressed`; nav uses `aria-current`.
- Visible focus ring on everything (2px, offset 2px).
- Touch targets ≥ 44px; kiosk ≥ 64px.
- Live regions: check-in result panel `aria-live="polite"`; toasts `role="status"`.
- Works at 360px width with no horizontal page scroll (tables scroll inside their own box).
- `prefers-reduced-motion` respected; `prefers-color-scheme` drives the default theme with a manual toggle stored per user.

---

## 8. Dark mode

- Dark is a full theme, not an inversion filter. Use the dark column of every token.
- Primary (ink) buttons become light (`#F4F4F5` bg, ink text). Inverse bands become `#1C1C1F`.
- Event accents keep their fill colour; text uses `--yy-accent-text` (lighter). Tints are re-mixed against `#111113`.
- Status: dark bg + light fg (see §2.4). Solid success/danger panels stay solid.
- QR codes always on a white plate.
- Shadows → `rgba(0,0,0,.5)`; rely more on borders.
- Cover images: no automatic dimming.

---

## 9. Implementing in the Yuyu codebase

Stack: Next.js 16 App Router, React 19, TypeScript, **MUI 9 + Emotion**, **Tailwind 4**, framer-motion. Follow the repo's AGENTS.md/CLAUDE.md, keep Server Components by default, and never weaken the security invariants (CSP nonce, tenant isolation, etc.).

### 9.1 One source of truth for tokens

1. `app/styles/tokens.css` declares every token as a CSS variable under `:root` (light) and `[data-theme="dark"]` / `@media (prefers-color-scheme: dark)` (dark), named `--yy-*` exactly as in §2.
2. **Tailwind 4** maps them in `@theme` (e.g. `--color-canvas: var(--yy-bg-canvas)`, `--color-accent: var(--yy-accent)`, `--radius-lg: 16px`, `--font-display: "Bricolage Grotesque", …`).
3. **MUI** uses `createTheme({ cssVariables: { colorSchemeSelector: 'data-theme' }, colorSchemes: { light, dark } })` with palette values pointing at the same hex values, `shape.borderRadius: 12`, typography variants mapped to §2.6, and component overrides:
   - `MuiButton`: `disableElevation`, `borderRadius: 999`, `textTransform: 'none'`, variants for `primary | accent | secondary | quiet | danger | dangerQuiet | inverse`.
   - `MuiTextField` / `MuiOutlinedInput`: **outlined only**, label rendered above (`InputLabel shrink` + `notched={false}` or a custom `Field` wrapper), remove filled variants.
   - `MuiChip`, `MuiTabs`, `MuiSwitch`, `MuiDialog`, `MuiTableCell` styled per §4.
4. Delete the v1 gradients, the bright blue `#0A7AFF`-style primary, and the filled grey MUI inputs.

### 9.2 Event accent at runtime

In the event layout (server component) compute accent tokens with a small pure helper (`lib/theme/accent.ts`: `getAccentTokens(hex, scheme)` returning `--yy-accent`, `--yy-accent-soft`, `--yy-on-accent`, `--yy-accent-text` with WCAG contrast checks) and set them as inline `style` CSS variables on the page root. Validate the hex server-side (zod) — never inject raw user strings into CSS.

### 9.3 Shared components to create

`Button`, `Field` (label + input + helper + error), `SearchField`, `PasswordField`, `Chip`, `StatusChip`, `DateBlock`, `Avatar` (initials fallback), `OrgLogo`, `EventCard`, `EventRow`, `StatTile`, `Callout`, `EmptyState`, `DangerZone`, `SectionNav`, `ScheduleList`, `ProgrammeGrid`, `RegistrationCard`, `StickyRegisterBar`, `Ticket`, `PinInput`, `RatingInput`, `CheckinResult`, `AppShell` (Sidebar + OrgSwitcher), `EventHeader`, `SiteHeader`, `EventContextHeader`, `SiteFooter`, `ConfirmDialog`, `Toast`.

### 9.4 Do / Don't

**Do:** use tokens; one primary action per view; label fields above; show the timezone once; keep event accents on event surfaces; keep content visible without JS animations; test light + dark + 360px.

**Don't:** gradient text or gradient buttons; hard-coded blues; floating MUI labels or filled inputs; cards in cards in cards; left-border accent cards; emoji; countdown timers; raw RRULE/URLs/seconds; Idlistack in the top nav; colour-only status; white text on a light accent.

---

*Version 1.0 · 14 Oct 2026 · Direction A+ (chosen after comparing Commons, Signal and Marquee).*
