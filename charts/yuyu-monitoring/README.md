# Yuyu resource history

This chart pins `prometheus-community/kube-prometheus-stack` 91.4.0 and provisions
Prometheus, Grafana, kube-state-metrics, node-exporter, and a Yuyu dashboard.
It does not change the application or collect application logs, request bodies,
credentials, or event content. Kubernetes workload names and labels are metrics
metadata. Node and kubelet metrics cover the shared server; the Yuyu dashboard
filters application panels to the `yuyu` namespace.

## Install or upgrade

Use namespace `monitoring`. Before the first installation, create Secret
`yuyu-grafana-admin` there with keys `admin-user` and `admin-password`, using a
password manager or server-side random generation. Do not commit credentials.

```sh
helm dependency build charts/yuyu-monitoring
helm lint charts/yuyu-monitoring
helm upgrade --install yuyu-monitoring charts/yuyu-monitoring \
  --namespace monitoring --create-namespace --wait --timeout 10m
```

On the k3s server, set `KUBECONFIG=/etc/rancher/k3s/k3s.yaml` for Helm.
Review upstream CRD upgrade instructions before changing the pinned version.

## Open Grafana

Open <https://grafana.yuyu.idliapps.com/d/yuyu-resources>. Username: `admin`.
Set `SSH_USER` and `K3S_SERVER_IP` for your server, then retrieve the generated
password in your own terminal:

```sh
ssh "${SSH_USER}@${K3S_SERVER_IP}" \
  'kubectl -n monitoring get secret yuyu-grafana-admin -o jsonpath="{.data.admin-password}" | base64 -d'
```

Treat this output as a password; do not paste it into chat, logs, or this repo.
Grafana has a permanent Traefik HTTPS ingress. cert-manager uses
`letsencrypt-prod` to issue and renew `grafana-yuyu-idliapps-com-tls`; HTTP
redirects to HTTPS. Set a DNS-only A record for `grafana.yuyu.idliapps.com` to
`<K3S_SERVER_IP>` before certificate issuance can complete. Grafana uses secure
cookies; anonymous access and sign-up are disabled. Prometheus remains internal.

## History and scope

- Scrapes every 30 seconds; history begins at installation.
- Prometheus requests a 10 GiB local-path volume and retains up to 90 days or
  20 GB of stored metric blocks, whichever threshold is reached first. WAL/head
  data also needs space. The existing 10 GiB claim is a nominal allocation:
  local-path does not enforce it as a quota, and the backing server disk has
  sufficient space. The volume is preserved to retain existing history. For
  quota-enforced storage, provision at least 25 GiB before using this limit.
  See [Prometheus storage documentation](https://prometheus.io/docs/prometheus/latest/storage/).
- Grafana requests a separate 1 GiB persistent volume for its database/settings.
- The 25-panel dashboard includes current CPU/memory totals and limits,
  utilization percentages, service-level history, total usage/request/limit
  comparisons, ready replicas, outbox last-success age, container detail,
  restarts, network traffic, PVC allocations, and shared-server resources.
  Service groups cover the web app, PostgreSQL, Redis, Garage (including its
  HTTPS proxy), and outbox worker. Short jobs can finish between scrapes, so
  their CPU history may have gaps; last-success age checks worker execution.
- PVC allocation is **not actual per-volume disk consumption**. Local-path
  provisioner does not impose the requested size as a disk quota.
- Metrics survive pod restarts. Both volumes are on the same server, so this
  is not off-server backup or high availability. Preserve PVCs when uninstalling.
- Alertmanager and alert rules are disabled. No email/Slack alerts are configured.
- Data collection is passive; full application integration tests are unnecessary
  for this infrastructure-only chart. Validate Helm, rollout, scrape targets,
  PromQL series, the dashboard provisioning, and persistence after deployment.

The dashboard is provisioned from `dashboards/yuyu-resources.json`; edit that
file and upgrade the release to make lasting dashboard changes.

Bundled datasource plugins are part of the Grafana image on a read-only
filesystem. Upgrade them through a reviewed image/chart update, rather than
the UI's plugin installation/update actions. A failed UI update can unregister
the running plugin; restarting Grafana reloads the bundled copy. Prometheus
continues collecting history while Grafana restarts.

Run `python3 scripts/k3s-monitoring-check.py` on the server to verify scrape
health, Yuyu resource series, historical samples, authenticated dashboard
provisioning, and Grafana's database without printing its password.
