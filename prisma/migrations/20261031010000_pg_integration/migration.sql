-- People's Gallery integration channel (docs/PG_INTEGRATION.md).
--
-- Additive: new tables, one nullable column on "OAuthGrant", trigger
-- functions, and AFTER/BEFORE row triggers on "Event", "RSVP", "Membership",
-- "EventCollaborator", "User", "OAuthGrant" and "OAuthClient". CREATE TRIGGER
-- takes a SHARE ROW EXCLUSIVE lock on each table for an instant (no rewrite,
-- no scan); adding the nullable column is metadata-only.
--
-- The triggers capture a change into "PgIntegrationDelivery" in the same
-- transaction as the change itself, only for organisations enabled in
-- "PgIntegrationOrganisation" (and, for user-level events, only for users with
-- a live grant to the integration's OAuth client). With no integration
-- configured each trigger is one indexed EXISTS and returns.

-- AlterTable
ALTER TABLE "OAuthGrant" ADD COLUMN     "subject" TEXT;

-- CreateTable
CREATE TABLE "OAuthClientToken" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClientToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PgIntegration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "oauthClientId" TEXT NOT NULL,
    "endpointUrl" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowInternalTarget" BOOLEAN NOT NULL DEFAULT false,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PgIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PgIntegrationOrganisation" (
    "organisationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PgIntegrationOrganisation_pkey" PRIMARY KEY ("organisationId")
);

-- CreateTable
CREATE TABLE "PgIntegrationResource" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "organisationId" TEXT,
    "eventId" TEXT,
    "version" BIGINT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "tombstone" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PgIntegrationResource_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PgIntegrationDelivery" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "organisationId" TEXT,
    "resourceKey" TEXT NOT NULL,
    "resourceVersion" BIGINT NOT NULL,
    "snapshot" JSONB,
    "payload" JSONB,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PgIntegrationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClientToken_tokenHash_key" ON "OAuthClientToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthClientToken_clientId_idx" ON "OAuthClientToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthClientToken_expiresAt_idx" ON "OAuthClientToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PgIntegration_oauthClientId_key" ON "PgIntegration"("oauthClientId");

-- CreateIndex
CREATE INDEX "PgIntegrationOrganisation_integrationId_idx" ON "PgIntegrationOrganisation"("integrationId");

-- CreateIndex
CREATE INDEX "PgIntegrationResource_kind_organisationId_updatedAt_key_idx" ON "PgIntegrationResource"("kind", "organisationId", "updatedAt", "key");

-- CreateIndex
CREATE INDEX "PgIntegrationResource_kind_eventId_updatedAt_key_idx" ON "PgIntegrationResource"("kind", "eventId", "updatedAt", "key");

-- CreateIndex
CREATE INDEX "PgIntegrationResource_deletedAt_idx" ON "PgIntegrationResource"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PgIntegrationDelivery_seq_key" ON "PgIntegrationDelivery"("seq");

-- CreateIndex
CREATE INDEX "PgIntegrationDelivery_status_nextAttemptAt_seq_idx" ON "PgIntegrationDelivery"("status", "nextAttemptAt", "seq");

-- CreateIndex
CREATE INDEX "PgIntegrationDelivery_createdAt_idx" ON "PgIntegrationDelivery"("createdAt");

-- CreateIndex
CREATE INDEX "PgIntegrationDelivery_resourceKey_resourceVersion_idx" ON "PgIntegrationDelivery"("resourceKey", "resourceVersion");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthGrant_clientId_subject_key" ON "OAuthGrant"("clientId", "subject");

-- AddForeignKey
ALTER TABLE "OAuthClientToken" ADD CONSTRAINT "OAuthClientToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgIntegration" ADD CONSTRAINT "PgIntegration_oauthClientId_fkey" FOREIGN KEY ("oauthClientId") REFERENCES "OAuthClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgIntegrationOrganisation" ADD CONSTRAINT "PgIntegrationOrganisation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgIntegrationOrganisation" ADD CONSTRAINT "PgIntegrationOrganisation_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "PgIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One instance-level integration; envelope ids are the PG idempotency key.
ALTER TABLE "PgIntegration" ADD CONSTRAINT "PgIntegration_singleton" CHECK ("id" = 'default');
ALTER TABLE "PgIntegrationDelivery" ADD CONSTRAINT "PgIntegrationDelivery_id_shape" CHECK ("id" ~ '^evt_[0-9a-f]{32}$');
ALTER TABLE "PgIntegrationDelivery" ADD CONSTRAINT "PgIntegrationDelivery_version_positive" CHECK ("resourceVersion" > 0);
ALTER TABLE "PgIntegrationResource" ADD CONSTRAINT "PgIntegrationResource_kind" CHECK ("kind" IN ('event', 'registration', 'access', 'user'));
ALTER TABLE "OAuthClientToken" ADD CONSTRAINT "OAuthClientToken_token_hash_shape" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

-- ---------------------------------------------------------------------------
-- Capture helpers

CREATE OR REPLACE FUNCTION "pg_integration_org_enabled"(org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "PgIntegrationOrganisation" o
    INNER JOIN "PgIntegration" i ON i."id" = o."integrationId"
    WHERE o."organisationId" = org_id AND i."enabled"
  );
$$;

-- The integration's OAuth client when the integration is on, else NULL.
CREATE OR REPLACE FUNCTION "pg_integration_client"()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT "oauthClientId" FROM "PgIntegration" WHERE "enabled" LIMIT 1;
$$;

-- Bump the per-resource version (row-locked, so concurrent writers of one
-- resource get increasing versions in commit order) and queue one delivery.
-- Timestamps are UTC wall-clock timestamp(3), whatever the session TimeZone.
CREATE OR REPLACE FUNCTION "pg_integration_enqueue"(
  p_type text, p_org text, p_kind text, p_resource_id text, p_event_id text,
  p_key text, p_snapshot jsonb, p_deleted boolean, p_tombstone jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamp(3) := (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  v_ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_version bigint;
BEGIN
  INSERT INTO "PgIntegrationResource" AS r
    ("key", "kind", "resourceId", "organisationId", "eventId", "version", "deletedAt", "tombstone", "updatedAt")
  VALUES (p_key, p_kind, p_resource_id, p_org, p_event_id, v_ms,
          CASE WHEN p_deleted THEN v_now END, CASE WHEN p_deleted THEN p_tombstone END, v_now)
  ON CONFLICT ("key") DO UPDATE SET
    "version" = GREATEST(r."version" + 1, EXCLUDED."version"),
    "organisationId" = EXCLUDED."organisationId",
    "eventId" = EXCLUDED."eventId",
    "deletedAt" = EXCLUDED."deletedAt",
    "tombstone" = EXCLUDED."tombstone",
    "updatedAt" = EXCLUDED."updatedAt"
  RETURNING r."version" INTO v_version;

  INSERT INTO "PgIntegrationDelivery"
    ("id", "eventType", "organisationId", "resourceKey", "resourceVersion", "snapshot", "status", "nextAttemptAt", "createdAt")
  VALUES ('evt_' || replace(gen_random_uuid()::text, '-', ''), p_type, p_org, p_key, v_version,
          p_snapshot, 'PENDING', v_now, v_now);
END;
$$;

-- ---------------------------------------------------------------------------
-- Events (one-off events only; series occurrences are not synced in P1)

CREATE OR REPLACE FUNCTION "pg_integration_capture_event"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r "Event";
  v_type text;
  v_changed text[] := ARRAY[]::text[];
  v_previous text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF NOT "pg_integration_org_enabled"(r."organisationId") THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    v_type := 'event.created';
  ELSIF TG_OP = 'DELETE' THEN
    v_type := 'event.deleted';
    v_previous := OLD."status"::text;
  ELSE
    IF NEW."title" IS DISTINCT FROM OLD."title" THEN v_changed := array_append(v_changed, 'title'); END IF;
    IF NEW."slug" IS DISTINCT FROM OLD."slug" THEN v_changed := array_append(v_changed, 'slug'); END IF;
    IF NEW."startDateTime" IS DISTINCT FROM OLD."startDateTime" THEN v_changed := array_append(v_changed, 'startDateTime'); END IF;
    IF NEW."endDateTime" IS DISTINCT FROM OLD."endDateTime" THEN v_changed := array_append(v_changed, 'endDateTime'); END IF;
    IF NEW."timezone" IS DISTINCT FROM OLD."timezone" THEN v_changed := array_append(v_changed, 'timezone'); END IF;
    IF NEW."location" IS DISTINCT FROM OLD."location" THEN v_changed := array_append(v_changed, 'location'); END IF;
    IF NEW."coverImageUrl" IS DISTINCT FROM OLD."coverImageUrl" THEN v_changed := array_append(v_changed, 'coverImageUrl'); END IF;
    IF NEW."status" IS DISTINCT FROM OLD."status" THEN v_changed := array_append(v_changed, 'status'); END IF;
    IF NEW."privacyType" IS DISTINCT FROM OLD."privacyType" THEN v_changed := array_append(v_changed, 'privacyType'); END IF;
    IF cardinality(v_changed) = 0 THEN RETURN NULL; END IF;
    v_previous := OLD."status"::text;
    IF NEW."status" IS DISTINCT FROM OLD."status" AND NEW."status" = 'PUBLISHED' THEN
      v_type := 'event.published';
    ELSIF NEW."status" IS DISTINCT FROM OLD."status" AND NEW."status" = 'CANCELLED' THEN
      v_type := 'event.cancelled';
    ELSE
      v_type := 'event.updated';
    END IF;
  END IF;

  PERFORM "pg_integration_enqueue"(
    v_type, r."organisationId", 'event', r."id", r."id", 'event:' || r."id" || ':',
    jsonb_build_object(
      'id', r."id", 'organisationId', r."organisationId", 'title', r."title", 'slug', r."slug",
      'startDateTime', r."startDateTime", 'endDateTime', r."endDateTime", 'timezone', r."timezone",
      'location', r."location", 'coverImageUrl', r."coverImageUrl", 'status', r."status"::text,
      'privacyType', r."privacyType"::text, 'previousStatus', v_previous, 'changed', to_jsonb(v_changed)
    ),
    TG_OP = 'DELETE',
    jsonb_build_object('kind', 'event', 'id', r."id", 'occurrenceId', NULL)
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER "pg_integration_event_insert_delete"
  AFTER INSERT OR DELETE ON "Event"
  FOR EACH ROW EXECUTE FUNCTION "pg_integration_capture_event"();
CREATE TRIGGER "pg_integration_event_update"
  AFTER UPDATE ON "Event"
  FOR EACH ROW
  WHEN (OLD."title" IS DISTINCT FROM NEW."title" OR OLD."slug" IS DISTINCT FROM NEW."slug"
     OR OLD."startDateTime" IS DISTINCT FROM NEW."startDateTime" OR OLD."endDateTime" IS DISTINCT FROM NEW."endDateTime"
     OR OLD."timezone" IS DISTINCT FROM NEW."timezone" OR OLD."location" IS DISTINCT FROM NEW."location"
     OR OLD."coverImageUrl" IS DISTINCT FROM NEW."coverImageUrl" OR OLD."status" IS DISTINCT FROM NEW."status"
     OR OLD."privacyType" IS DISTINCT FROM NEW."privacyType")
  EXECUTE FUNCTION "pg_integration_capture_event"();

-- ---------------------------------------------------------------------------
-- Registrations. A deleted row is a cancellation (attendee) or a removal
-- (organiser): the removal cores set the transaction-local setting
-- yuyu.pg_rsvp_delete_status = 'REMOVED' before deleting. The snapshot never
-- holds a guest email, answers or the check-in token.

CREATE OR REPLACE FUNCTION "pg_integration_capture_rsvp"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r "RSVP";
  v_org text;
  v_type text;
  v_status text;
  v_previous text;
  v_reason text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF r."eventId" IS NULL THEN RETURN NULL; END IF;
  -- A cascade from a deleted event finds no event row: event.deleted covers it.
  SELECT "organisationId" INTO v_org FROM "Event" WHERE "id" = r."eventId";
  IF v_org IS NULL OR NOT "pg_integration_org_enabled"(v_org) THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    v_type := 'registration.created';
    v_status := NEW."status"::text;
  ELSIF TG_OP = 'DELETE' THEN
    v_type := 'registration.status_changed';
    v_reason := current_setting('yuyu.pg_rsvp_delete_status', true);
    v_status := CASE WHEN v_reason = 'REMOVED' THEN 'REMOVED' ELSE 'CANCELLED' END;
    v_previous := OLD."status"::text;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    v_type := 'registration.status_changed';
    v_status := NEW."status"::text;
    v_previous := OLD."status"::text;
  ELSE
    v_type := 'registration.updated';
    v_status := NEW."status"::text;
  END IF;

  PERFORM "pg_integration_enqueue"(
    v_type, v_org, 'registration', r."id", r."eventId", 'registration:' || r."id",
    jsonb_build_object(
      'id', r."id", 'eventId', r."eventId", 'userId', r."userId", 'guestName', r."guestName",
      'status', v_status, 'previousStatus', v_previous, 'isCrew', r."isCrew",
      'createdAt', r."createdAt", 'checkedInAt', r."checkedInAt"
    ),
    TG_OP = 'DELETE',
    jsonb_build_object(
      'id', r."id", 'eventId', r."eventId", 'userId', r."userId", 'status', v_status,
      'isCrew', r."isCrew", 'createdAt', r."createdAt", 'checkedInAt', r."checkedInAt"
    )
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER "pg_integration_rsvp_insert_delete"
  AFTER INSERT OR DELETE ON "RSVP"
  FOR EACH ROW EXECUTE FUNCTION "pg_integration_capture_rsvp"();
CREATE TRIGGER "pg_integration_rsvp_update"
  AFTER UPDATE ON "RSVP"
  FOR EACH ROW
  WHEN (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."userId" IS DISTINCT FROM NEW."userId"
     OR OLD."isCrew" IS DISTINCT FROM NEW."isCrew")
  EXECUTE FUNCTION "pg_integration_capture_rsvp"();

-- ---------------------------------------------------------------------------
-- Access: organisation roles and event collaborator grants. One resource per
-- (person, organisation), the key PG versions access.changed on.

CREATE OR REPLACE FUNCTION "pg_integration_capture_access"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_row jsonb;
  v_user text;
  v_org text;
  v_event text;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_user := v_row ->> 'userId';
  IF TG_TABLE_NAME = 'Membership' THEN
    v_org := v_row ->> 'organisationId';
  ELSE
    v_event := v_row ->> 'eventId';
    IF v_event IS NULL THEN RETURN NULL; END IF;
    SELECT "organisationId" INTO v_org FROM "Event" WHERE "id" = v_event;
  END IF;
  IF v_org IS NULL OR NOT "pg_integration_org_enabled"(v_org) THEN RETURN NULL; END IF;

  PERFORM "pg_integration_enqueue"(
    'access.changed', v_org, 'access', v_user, v_event, 'access:' || v_user || ':' || v_org,
    jsonb_build_object('userId', v_user, 'organisationId', v_org, 'eventId', v_event),
    false, NULL
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER "pg_integration_membership_insert_delete"
  AFTER INSERT OR DELETE ON "Membership"
  FOR EACH ROW EXECUTE FUNCTION "pg_integration_capture_access"();
CREATE TRIGGER "pg_integration_membership_update"
  AFTER UPDATE ON "Membership"
  FOR EACH ROW
  WHEN (OLD."role" IS DISTINCT FROM NEW."role" OR OLD."userId" IS DISTINCT FROM NEW."userId")
  EXECUTE FUNCTION "pg_integration_capture_access"();
CREATE TRIGGER "pg_integration_collaborator_insert_delete"
  AFTER INSERT OR DELETE ON "EventCollaborator"
  FOR EACH ROW EXECUTE FUNCTION "pg_integration_capture_access"();
CREATE TRIGGER "pg_integration_collaborator_update"
  AFTER UPDATE ON "EventCollaborator"
  FOR EACH ROW
  WHEN (OLD."permissions" IS DISTINCT FROM NEW."permissions" OR OLD."userId" IS DISTINCT FROM NEW."userId")
  EXECUTE FUNCTION "pg_integration_capture_access"();

-- ---------------------------------------------------------------------------
-- Users: session revocation and account deletion, only for people who linked
-- People's Gallery (a live grant to the integration's OAuth client).

CREATE OR REPLACE FUNCTION "pg_integration_capture_user"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_client text := "pg_integration_client"();
  v_user text;
  v_type text := 'user.sessions_revoked';
  v_reason text;
  v_grant record;
BEGIN
  IF v_client IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NULL END;
  END IF;

  IF TG_TABLE_NAME = 'OAuthClient' THEN
    IF NEW."id" <> v_client THEN RETURN NULL; END IF;
    FOR v_grant IN SELECT "userId" FROM "OAuthGrant" WHERE "clientId" = v_client AND "revokedAt" IS NULL LOOP
      PERFORM "pg_integration_enqueue"(
        v_type, NULL, 'user', v_grant."userId", NULL, 'user:' || v_grant."userId",
        jsonb_build_object('userId', v_grant."userId", 'reason', 'client_disabled'), false, NULL
      );
    END LOOP;
    RETURN NULL;
  ELSIF TG_TABLE_NAME = 'OAuthGrant' THEN
    IF NEW."clientId" <> v_client THEN RETURN NULL; END IF;
    v_user := NEW."userId";
    v_reason := 'grant_revoked';
  ELSIF TG_OP = 'DELETE' THEN
    v_user := OLD."id";
    v_type := 'user.deleted';
    IF NOT EXISTS (SELECT 1 FROM "OAuthGrant" WHERE "userId" = v_user AND "clientId" = v_client AND "revokedAt" IS NULL) THEN
      RETURN OLD;
    END IF;
  ELSE
    v_user := NEW."id";
    v_reason := 'session_version';
    IF NOT EXISTS (SELECT 1 FROM "OAuthGrant" WHERE "userId" = v_user AND "clientId" = v_client AND "revokedAt" IS NULL) THEN
      RETURN NULL;
    END IF;
  END IF;

  PERFORM "pg_integration_enqueue"(
    v_type, NULL, 'user', v_user, NULL, 'user:' || v_user,
    jsonb_build_object('userId', v_user, 'reason', v_reason), TG_OP = 'DELETE', NULL
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NULL END;
END;
$$;

CREATE TRIGGER "pg_integration_user_sessions"
  AFTER UPDATE OF "sessionVersion" ON "User"
  FOR EACH ROW
  WHEN (OLD."sessionVersion" IS DISTINCT FROM NEW."sessionVersion")
  EXECUTE FUNCTION "pg_integration_capture_user"();
-- BEFORE, so the grant (which cascades with the user) is still visible.
CREATE TRIGGER "pg_integration_user_delete"
  BEFORE DELETE ON "User"
  FOR EACH ROW EXECUTE FUNCTION "pg_integration_capture_user"();
CREATE TRIGGER "pg_integration_grant_revoked"
  AFTER UPDATE OF "revokedAt" ON "OAuthGrant"
  FOR EACH ROW
  WHEN (OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL)
  EXECUTE FUNCTION "pg_integration_capture_user"();
CREATE TRIGGER "pg_integration_client_disabled"
  AFTER UPDATE OF "status" ON "OAuthClient"
  FOR EACH ROW
  WHEN (OLD."status" = 'ACTIVE' AND NEW."status" <> 'ACTIVE')
  EXECUTE FUNCTION "pg_integration_capture_user"();

-- ---------------------------------------------------------------------------
-- When an organisation is enabled (scripts/pg-integration.ts enable-org),
-- give each of its events and registrations a fresh version so the backfill
-- API lists them all and anything changed while it was disabled outranks
-- what People's Gallery stored before. No deliveries are queued: PG pulls.

CREATE OR REPLACE FUNCTION "pg_integration_seed_organisation"(org_id text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamp(3) := (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  v_ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_count integer;
BEGIN
  INSERT INTO "PgIntegrationResource" AS r ("key", "kind", "resourceId", "organisationId", "eventId", "version", "updatedAt")
  SELECT 'event:' || e."id" || ':', 'event', e."id", e."organisationId", e."id", v_ms, v_now
  FROM "Event" e WHERE e."organisationId" = org_id
  ON CONFLICT ("key") DO UPDATE SET
    "version" = GREATEST(r."version" + 1, EXCLUDED."version"), "deletedAt" = NULL, "tombstone" = NULL, "updatedAt" = EXCLUDED."updatedAt";
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO "PgIntegrationResource" AS r ("key", "kind", "resourceId", "organisationId", "eventId", "version", "updatedAt")
  SELECT 'registration:' || v."id", 'registration', v."id", e."organisationId", e."id", v_ms, v_now
  FROM "RSVP" v INNER JOIN "Event" e ON e."id" = v."eventId"
  WHERE e."organisationId" = org_id
  ON CONFLICT ("key") DO UPDATE SET
    "version" = GREATEST(r."version" + 1, EXCLUDED."version"), "deletedAt" = NULL, "tombstone" = NULL, "updatedAt" = EXCLUDED."updatedAt";
  RETURN v_count;
END;
$$;
