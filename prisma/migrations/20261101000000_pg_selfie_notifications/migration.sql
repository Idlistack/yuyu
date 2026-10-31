-- People's Gallery P3: selfie step consent, enrollment tickets, attendee
-- notification receipts and notification preferences (docs/PG_INTEGRATION.md).
--
-- Additive: four new tables, one nullable column on "PgIntegration"
-- (metadata-only), and a replaced CHECK on "PgIntegrationResource"."kind"
-- (a small instance-level table; the re-check scans it under a brief
-- ACCESS EXCLUSIVE lock). The new foreign keys to "RSVP" and "User" take a
-- SHARE ROW EXCLUSIVE lock on those tables for an instant: the new tables are
-- empty, so validation is immediate.
--
-- No image bytes, image hashes or face embeddings are stored anywhere in
-- Yuyu (decision D-Selfie): only consent, the age attestation, the selfie
-- state People's Gallery reports, its opaque enrollment id and ticket ids.

-- AlterTable
ALTER TABLE "PgIntegration" ADD COLUMN     "publicUrl" TEXT;

-- CreateTable
CREATE TABLE "PgFaceConsent" (
    "id" TEXT NOT NULL,
    "rsvpId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "ageAttestation" TEXT NOT NULL,
    "ageAttestedAt" TIMESTAMP(3) NOT NULL,
    "noticeVersion" TEXT,
    "grantedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "selfieState" TEXT NOT NULL DEFAULT 'NONE',
    "enrollmentId" TEXT,
    "rejectedReason" TEXT,
    "selfieUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PgFaceConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PgSelfieTicket" (
    "jti" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "enrollmentId" TEXT,

    CONSTRAINT "PgSelfieTicket_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "PgNotificationReceipt" (
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "accepted" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PgNotificationReceipt_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "userId" TEXT NOT NULL,
    "pgPhotosEmail" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PgFaceConsent_rsvpId_key" ON "PgFaceConsent"("rsvpId");

-- CreateIndex
CREATE INDEX "PgFaceConsent_userId_idx" ON "PgFaceConsent"("userId");

-- CreateIndex
CREATE INDEX "PgFaceConsent_eventId_idx" ON "PgFaceConsent"("eventId");

-- CreateIndex
CREATE INDEX "PgSelfieTicket_userId_issuedAt_idx" ON "PgSelfieTicket"("userId", "issuedAt");

-- CreateIndex
CREATE INDEX "PgSelfieTicket_expiresAt_idx" ON "PgSelfieTicket"("expiresAt");

-- CreateIndex
CREATE INDEX "PgNotificationReceipt_createdAt_idx" ON "PgNotificationReceipt"("createdAt");

-- AddForeignKey
ALTER TABLE "PgFaceConsent" ADD CONSTRAINT "PgFaceConsent_rsvpId_fkey" FOREIGN KEY ("rsvpId") REFERENCES "RSVP"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgFaceConsent" ADD CONSTRAINT "PgFaceConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgSelfieTicket" ADD CONSTRAINT "PgSelfieTicket_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "PgFaceConsent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity backstops
ALTER TABLE "PgFaceConsent" ADD CONSTRAINT "PgFaceConsent_age_attestation" CHECK ("ageAttestation" IN ('ADULT', 'MINOR'));
ALTER TABLE "PgFaceConsent" ADD CONSTRAINT "PgFaceConsent_selfie_state" CHECK ("selfieState" IN ('NONE', 'PENDING', 'ADDED', 'REJECTED', 'REMOVED'));
-- A minor never has a face-matching grant (D-12).
ALTER TABLE "PgFaceConsent" ADD CONSTRAINT "PgFaceConsent_no_minor_grant" CHECK ("ageAttestation" = 'ADULT' OR ("grantedAt" IS NULL AND "noticeVersion" IS NULL));
ALTER TABLE "PgSelfieTicket" ADD CONSTRAINT "PgSelfieTicket_jti_shape" CHECK ("jti" ~ '^yet_[0-9a-f]{32}$');
ALTER TABLE "PgNotificationReceipt" ADD CONSTRAINT "PgNotificationReceipt_hash_shape" CHECK ("requestHash" ~ '^[0-9a-f]{64}$');

-- Selfie and consent resources get their own version counters.
ALTER TABLE "PgIntegrationResource" DROP CONSTRAINT "PgIntegrationResource_kind";
ALTER TABLE "PgIntegrationResource" ADD CONSTRAINT "PgIntegrationResource_kind" CHECK ("kind" IN ('event', 'registration', 'access', 'user', 'selfie', 'consent'));
