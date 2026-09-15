# Yuyu single-node services

This optional companion chart creates dedicated PostgreSQL 17, Redis 8, and
Garage 2.3 private object storage in the `yuyu` namespace. Deploy it before the
application chart, whose pre-install migration hook needs a working database.
It requires cert-manager and the `local-path` storage class. Resource names are
fixed; install only one release in this namespace.

PostgreSQL rejects non-TLS TCP connections, Redis exposes only its authenticated
TLS listener, and Garage's S3 and administrative listeners bind to loopback.
An nginx sidecar terminates S3 TLS. All services are ClusterIP-only and their
NetworkPolicy accepts connections only from the same namespace. Application
database credentials have DML access; the separate migration role owns the
schema. The S3 credential can read and write only the private `yuyu-assets` bucket.

The scripts in `scripts/k3s-*.py` bootstrap credentials on the server, preserving
existing keys on repeat runs. No real credentials belong in Helm values or this
repository. See [the deployment runbook](../../docs/DEPLOYMENT_K3S.md).

StatefulSet PVCs are retained on uninstall. Do not delete the `yuyu` namespace or
its PVCs to redeploy the app. Service image upgrades must use compatible database
formats; a PostgreSQL major-version change requires a planned data migration.

cert-manager rotates service certificates. The hourly host timer running
`k3s-renew-services.py` reloads PostgreSQL, Redis, and nginx after the updated
certificate reaches their mounted volumes. Traefik reloads public certificates
automatically. CA rotation and expiry still require operator monitoring.

This topology has one copy of each service on one server. Persistent volumes are
not backups or high availability. Off-server encrypted backups, retention, restore
drills, and host disk encryption must be arranged separately; this chart does not
implement or claim those controls.
