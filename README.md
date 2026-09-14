# Yuyu

<p align="center">
  <a href="https://github.com/twilighty-abhi/yuyu">
    <img src="public/brand/yuyu-mark.svg" width="112" height="112" alt="Yuyu" />
  </a>
</p>

<p align="center">
  A self-hosted platform for creating, running, and following up on free events.
</p>

<p align="center">
  <a href="https://github.com/twilighty-abhi/yuyu">View on GitHub</a>
  ·
  <a href="docs/README.md">Documentation</a>
  ·
  <a href="docs/DEVELOPMENT.md">Local development</a>
  ·
  <a href="docs/DEPLOYMENT_DOCKER.md">Production deployment</a>
</p>

Yuyu is a multi-tenant event platform built with Next.js, PostgreSQL, Prisma,
Auth.js, and Material UI. It is designed for organisers who want to retain
control of their data and run free events without payments, ticket sales, or
advertising trackers.

## What it includes

- Public, hidden-link, invite-only, and approval-required events
- Custom registration forms, capacity limits, waitlists, and approvals
- QR tickets, offline-capable door check-in, and attendee reporting
- Event websites with programme tracks, speakers, venues, sponsors, FAQs, and resources
- Feedback forms, response reporting, and eligible attendee certificates
- Recurring event series, organisation roles, event collaborators, and tenant-bound API clients
- Security-conscious operations: private object storage, CSP nonces, rate limiting, audit events, outbox email, and readiness checks

## Quick start (local development)

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

For local services and development notes, see [Local development](docs/DEVELOPMENT.md).

## Production deployment

Yuyu ships a standalone Docker build and a Helm chart. Production requires
TLS-backed PostgreSQL, Redis, private S3-compatible storage, authenticated SMTP,
and a reverse proxy. Apply migrations as a separate release step before rolling
out the application image.

- [Docker deployment guide](docs/DEPLOYMENT_DOCKER.md)
- [Helm chart](charts/yuyu/README.md)
- [Production release checklist](docs/PRODUCTION_RELEASE.md)

## Documentation

The project handbook lives in [`docs/`](docs/README.md):

- [Features](docs/FEATURES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Local development](docs/DEVELOPMENT.md)
- [Configuration](docs/CONFIGURATION.md)
- [Routes and HTTP endpoints](docs/ROUTES.md)
- [Machine API v1](docs/API.md)
- [Security model](docs/SECURITY.md)
- [Testing and quality gates](docs/TESTING.md)
- [Production release checklist](docs/PRODUCTION_RELEASE.md)
- [Production operations](docs/production-operations.md)
- [Production Docker deployment](docs/DEPLOYMENT_DOCKER.md)
- [Future work](docs/FUTURE_PHASES.md)

## Common commands

```bash
npm run dev                  # development server
npm run lint                 # ESLint
npx tsc --noEmit             # TypeScript validation
npm run test:unit            # unit tests
npm run test:integration     # PostgreSQL-backed tests
npm run test:e2e             # browser tests against development
npm run test:e2e:production  # browser tests against standalone output
npm run test:coverage        # repository-wide coverage report
npm run build                # production build
```

## License

No license file is currently included. Do not redistribute the project as open
source until a license is added.
