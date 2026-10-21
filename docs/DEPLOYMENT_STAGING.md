# Isolated staging deployment

[Documentation index](README.md)

This guide describes the disposable staging/test deployment at
`https://events.dev.idliapps.com`. The application and all backing services run
on the same VM under Docker Compose; Nginx remains installed directly on the
Ubuntu host as the TLS reverse proxy.

It is deliberately **not** a real production topology. The staging template
sets `CI=true` and `ALLOW_INSECURE_PRODUCTION_TESTS=1`, allowing non-TLS
PostgreSQL, Redis, and MinIO traffic on the private Docker network. Never use
those values for production or real user data.

## Server layout

The repository is deployed at:

```text
/opt/yuyu-staging/app
```

Copy the template and put real staging-only secrets in the ignored file:

```bash
cd /opt/yuyu-staging/app
cp .env.staging.example .env.staging
chmod 600 .env.staging
```

`POSTGRES_PASSWORD` must match the password embedded in `DATABASE_URL`, and
`REDIS_PASSWORD` must match the password embedded in `REDIS_URL`. Generate the
five secrets (`AUTH_SECRET`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`,
`MFA_ENCRYPTION_KEY`, `CRON_SECRET`, and `HEALTHCHECK_SECRET`) as documented in
[Configuration](CONFIGURATION.md).

Both `migrate` and `app` read `.env.staging`, so they share one
`MFA_ENCRYPTION_KEY`. Keep that value when redeploying or recreating the file:
it decrypts the SMTP password, Google client secret, and alert webhook saved in
Super admin → Settings. A changed key leaves those settings unreadable (check
with `docker compose --env-file .env.staging -f compose.staging.yml run --rm migrate node scripts/check-instance-secrets.mjs`).

## Email, Google SSO, and alerts

The template's `EMAIL_FROM`/`SMTP_*` values point at the bundled Mailpit and
are only a fallback. Once SMTP is saved in Super admin → Settings, those
environment values are ignored entirely; clear the panel's SMTP to return to
Mailpit. Panel changes apply on the next send or sign-in without rebuilding or
restarting the container. The app container sends email from its in-process
outbox worker (there is no separate worker service) and posts operational
alerts directly to the configured webhook, so the VM must allow outbound HTTPS
(and outbound SMTP for a real relay).

The application runs with `NODE_ENV=production`, so its SMTP transport requires
TLS with a verified certificate. Mailpit listens on plain SMTP (port 1025), so
delivery to it is rejected unless the transport applies the staging/CI
exception; to test real delivery, save an external TLS relay in the panel.

## First deployment

Start infrastructure services:

```bash
docker compose --env-file .env.staging -f compose.staging.yml up -d postgres redis minio mailpit
```

Initialize the private MinIO bucket:

```bash
docker compose --env-file .env.staging -f compose.staging.yml up minio-init
```

Run database migrations (starting `app` also runs `migrate` first and waits
for it to succeed, but running it explicitly shows the output):

```bash
docker compose --env-file .env.staging -f compose.staging.yml run --rm migrate
```

Build the application image:

```bash
docker compose --env-file .env.staging -f compose.staging.yml build app
```

Start or recreate the application:

```bash
docker compose --env-file .env.staging -f compose.staging.yml up -d app
```

Check status:

```bash
docker compose --env-file .env.staging -f compose.staging.yml ps
```

The expected result of both checks is HTTP 200:

```bash
curl -I http://127.0.0.1:3001/api/health
curl -I https://events.dev.idliapps.com/api/health
```

PostgreSQL, Redis, and MinIO intentionally have no host ports. Mailpit's UI is
bound only to `127.0.0.1:8025`; access it through an SSH tunnel when needed.

## Nginx on the host

Nginx is not a Docker service. Its TLS virtual host must proxy the public
staging hostname to the loopback-only application port:

```nginx
server {
    listen 443 ssl http2;
    server_name events.dev.idliapps.com;

    # ssl_certificate and ssl_certificate_key are managed by Certbot.

    # Live ticket check-in stream (text/event-stream): never buffer it, and
    # allow idle reads longer than the route's 25-second heartbeat.
    location /api/ticket/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The staging template sets `TRUSTED_PROXY_IP_HEADER="x-forwarded-for"`, and
Yuyu uses the **first** entry of that header as the client address for rate
limiting (`getClientIpFromHeaders` in `lib/rateLimit.ts`). Nginx must therefore
overwrite the header with the address it saw (`$remote_addr`), not append to it
with `$proxy_add_x_forwarded_for`: appending keeps any value the client sent
first, so a client could choose its own rate-limit identity. Alternatively set
`TRUSTED_PROXY_IP_HEADER="x-real-ip"` in `.env.staging`, which the block above
also sets from `$remote_addr`. If a CDN sits in front of Nginx, use the header
that the CDN overwrites (for example `cf-connecting-ip`) instead.

Without the `/api/ticket/` location, Nginx buffers the live ticket stream and an
attendee's ticket only tears at its 15-second status check.

Validate and reload any Nginx change:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Subsequent deployments

Take a database backup before migrations, then pull, build, migrate, and
recreate the application:

```bash
cd /opt/yuyu-staging/app
git pull --ff-only
docker compose --env-file .env.staging -f compose.staging.yml build app migrate
docker compose --env-file .env.staging -f compose.staging.yml run --rm migrate
docker compose --env-file .env.staging -f compose.staging.yml up -d app
docker compose --env-file .env.staging -f compose.staging.yml ps
```
