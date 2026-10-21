# Local development

[Documentation index](README.md)

## Prerequisites

- Node.js 20 or newer (22.18 or newer to run `npm run brand:generate`, which executes a TypeScript script directly)
- npm
- Docker and Docker Compose for local PostgreSQL

Redis, SMTP, and S3 are optional during ordinary local development. They are required or explicitly validated for production.

## First-time setup

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. The Compose database defaults are already reflected in `.env.example`.

Generate development secrets when needed:

```bash
openssl rand -base64 32
```

Use independent values for `AUTH_SECRET`, `CRON_SECRET`, `HEALTHCHECK_SECRET`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and `MFA_ENCRYPTION_KEY`. Do not commit `.env`.

## Database workflow

```bash
npm run db:migrate  # create/apply a development migration
npm run db:status   # show migration state
npm run db:verify   # verify the production schema contract
npm run db:studio   # open Prisma Studio
```

Prefer migrations over `db:push` for changes that will be deployed. Review generated SQL, indexes, nullability, data backfills, and cascade behavior before committing it.

## Everyday development

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run test:unit
```

Next.js 16 behavior may differ from older versions. Before changing framework APIs or conventions, read the applicable guide under `node_modules/next/dist/docs/` as required by `AGENTS.md`.

## Local service behavior

- PostgreSQL stores all application data.
- Without Redis, local rate limiting uses a process-local in-memory fallback, and live ticket check-in notifications use an in-process emitter (shared through `globalThis`), so the ticket tear works on a single dev server.
- Without `NEXT_PUBLIC_BASE_URL`, broadcast previews still show the event cover, but sent emails leave out site-relative images and links.
- Each `app/super-admin/**/page.tsx` must call `await requireSuperAdminMfa()` itself; a unit test enforces it. Do not add a root `app/loading.tsx`: it makes public pages stream a 200 before `notFound()`/`redirect()` run (see [Architecture](ARCHITECTURE.md)).
- Without S3 configuration, local assets can remain as database blobs.
- Email requires an SMTP service or host, from `/super-admin/settings` or the `SMTP_*` environment fallback (saved panel SMTP replaces the environment as a whole; blank environment values count as unset). Use a local mail catcher if you need to inspect messages.
- Google login appears when Google SSO has both a client ID and secret, either from the super-admin instance settings or the legacy environment fallback. To use instance settings locally, first create the configured super-admin account and enroll TOTP from `/account/security`.
- SMTP, Google SSO, and displayed backup posture can be configured at `/super-admin/settings`; legacy environment values remain useful for bootstrapping and unattended deployments.

## Before opening a pull request

```bash
npm run lint
npx tsc --noEmit
npm run test:coverage
TEST_DATABASE_URL="postgresql://yuyu:yuyu_dev@localhost:5432/yuyu_test" npm run test:integration
npm run build
git diff --check
```

`TEST_DATABASE_URL` must name a separate, disposable database with migrations
applied, never `yuyu_dev`: the integration suites create and delete rows and
the config refuses to start without it. See [Testing](TESTING.md) for creating
`yuyu_test` and the list of suites.

Run `npm run test:e2e` (development server) or `npm run test:e2e:production`
(after building) when changes affect routing, security headers,
authentication, tickets, or public workflows. Every browser spec seeds its own
fixtures through Prisma, so they need the migrated database in `DATABASE_URL`;
`tests/e2e/redesign-journeys.spec.ts` walks the full organiser and attendee
journey through the redesigned dashboard.
