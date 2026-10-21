# Yuyu Helm chart

Use this chart only on Kubernetes. For a single VPS or another container host
without Kubernetes, use the
[production Docker deployment guide](../../docs/DEPLOYMENT_DOCKER.md) instead.

## Images

Publish two images from the same commit and use immutable tags:

```bash
docker build --target migrator -t registry.example.com/yuyu-migrator:VERSION .
docker build --target runner \
  --secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY --build-arg NEXT_PUBLIC_BASE_URL="$NEXT_PUBLIC_BASE_URL" \
  -t registry.example.com/yuyu:VERSION .
```

The Server Actions key is required by the application build, not the migrator
build. It must be present at application runtime with the same stable value.

## Runtime secret

Create the namespace and a Kubernetes Secret outside Helm. It must include every production value required by `.env.example` / `npm run production:check`.

```bash
kubectl create namespace yuyu
kubectl -n yuyu create secret generic yuyu-runtime --from-env-file=/secure/path/yuyu.env
```

Use External Secrets or Sealed Secrets in a real production cluster; do not commit the secret manifest.

The Secret is loaded with `envFrom` into every application pod and the migration Job, so all of them receive the same values. In particular `MFA_ENCRYPTION_KEY` must stay identical across pods and stable across releases: it decrypts MFA seeds and the SMTP password, Google client secret, and alert webhook saved in Super admin → Settings. A pod with a different key still starts and passes probes, but email, Google sign-in, alerts, and MFA fail on it. When rotating the Secret, restart all pods together (`kubectl rollout restart`), because `envFrom` values are read only at pod start.

`EMAIL_FROM`, `SMTP_*`, and `AUTH_GOOGLE_*` are optional fallbacks. Settings saved in Super admin → Settings are stored in PostgreSQL and read on every send/sign-in, so they apply to all replicas immediately with no rollout; once SMTP is saved there, the environment SMTP values are ignored entirely. `AUTH_URL` and `NEXT_PUBLIC_BASE_URL` must be the same HTTPS origin as the ingress host, and `NEXT_PUBLIC_BASE_URL` is also baked into the image at build time.

## Install

Create a `values-production.yaml` outside source control:

```yaml
image:
  repository: registry.example.com/yuyu
  tag: "VERSION"
migration:
  image:
    repository: registry.example.com/yuyu-migrator
    tag: "VERSION"
ingress:
  enabled: true
  className: nginx
  annotations:
    # Live ticket stream (/api/ticket/:token/events) must not be buffered.
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
  hosts:
    - host: events.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: events-example-com-tls
      hosts: [events.example.com]
```

### Live ticket stream and ingress buffering

`GET /api/ticket/:token/events` is a long-lived `text/event-stream` that tears
an attendee's ticket the moment they are checked in. The route sends
`X-Accel-Buffering: no` and a comment heartbeat every 25 seconds, but the
ingress must not buffer the response and must allow idle reads of at least
30 seconds; otherwise the tear waits for the ticket's 15-second status check.
The chart's `ingress.annotations` default is empty, so add the controller's
equivalent of the ingress-nginx annotations above. They apply to every path on
the host, which is harmless for Yuyu's other responses; to scope them, serve
`/api/ticket/` from a separate Ingress object. Other controllers (Traefik, cloud
load balancers) need their own unbuffered-streaming and idle-timeout settings.

Validate and deploy:

```bash
helm lint charts/yuyu
helm upgrade --install yuyu charts/yuyu --namespace yuyu --create-namespace --values /secure/path/values-production.yaml --wait --timeout 10m
```

The migration Job is a Helm pre-install/pre-upgrade hook that runs `prisma migrate deploy` (the same as `npm run db:deploy`). A failed migration blocks the application rollout.

Set `migration.checkInstanceSecrets=true` to also run `scripts/check-instance-secrets.mjs` in the Job after migrating; the release then fails before any pod rolls if `MFA_ENCRYPTION_KEY` cannot decrypt the secrets already saved in the panel. It needs a migrator image built from this repository's Dockerfile at this version or later.

## Probes

The Deployment defines three probes (`templates/deployment.yaml`):

- startup and liveness: `GET /api/health`, dependency-free;
- readiness: an `exec` probe that calls `GET /api/health/db` on the pod with `Authorization: Bearer $HEALTHCHECK_SECRET`, so the runtime Secret must contain `HEALTHCHECK_SECRET`. A pod whose database check fails is taken out of the Service without being restarted.

## Replicas, Redis, and egress

With `autoscaling.enabled=true` the HPA owns the replica count (the Deployment omits `replicas`). Multiple replicas need the shared `REDIS_URL` (`rediss://`) for rate limiting and live ticket check-in; panel settings need nothing extra because each request reads them from the database. Every pod runs its own outbox worker (row claims make that safe) and posts operational alerts itself.

The chart creates no NetworkPolicy. If the namespace has a default-deny egress policy, allow application pods to reach PostgreSQL, Redis, object storage, the SMTP relay (typically TCP 465/587), Google OAuth endpoints (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`; HTTPS) when Google SSO is enabled, and the alert webhook host (HTTPS 443), plus DNS. The migration Job needs PostgreSQL and DNS only.
