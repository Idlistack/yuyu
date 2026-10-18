-- Mobile app (Android and iOS) sessions. Only SHA-256 digests of bearer
-- tokens are stored; rows cascade with their user.

-- CreateTable
CREATE TABLE "MobileSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "previousRefreshTokenHash" TEXT,
    "rotatedAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "MobileSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileSession_accessTokenHash_key" ON "MobileSession"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MobileSession_refreshTokenHash_key" ON "MobileSession"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MobileSession_previousRefreshTokenHash_key" ON "MobileSession"("previousRefreshTokenHash");

-- CreateIndex
CREATE INDEX "MobileSession_userId_revokedAt_idx" ON "MobileSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "MobileSession_refreshExpiresAt_idx" ON "MobileSession"("refreshExpiresAt");

-- AddForeignKey
ALTER TABLE "MobileSession" ADD CONSTRAINT "MobileSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mobile check-ins record where they came from. Extend the immutable
-- history's allowed sources; existing rows already satisfy the new list.
ALTER TABLE "CheckInEvent" DROP CONSTRAINT "CheckInEvent_known_source";
ALTER TABLE "CheckInEvent" ADD CONSTRAINT "CheckInEvent_known_source"
  CHECK ("source" IN ('online', 'offline-sync', 'venue-station', 'mobile-scan', 'mobile-manual')) NOT VALID;
ALTER TABLE "CheckInEvent" VALIDATE CONSTRAINT "CheckInEvent_known_source";

-- Closing sign-ups from a mobile app snapshots the organiser's cutoff so that
-- reopening restores it; the dashboard event form clears the snapshot.
ALTER TABLE "Event" ADD COLUMN "registrationManuallyClosedAt" TIMESTAMP(3),
ADD COLUMN "registrationCutoffBeforeManualClose" TIMESTAMP(3),
ADD COLUMN "registrationLeadBeforeManualClose" INTEGER;
ALTER TABLE "Event" ADD CONSTRAINT "Event_manual_close_snapshot_mode"
  CHECK (NOT ("registrationCutoffBeforeManualClose" IS NOT NULL AND "registrationLeadBeforeManualClose" IS NOT NULL));
