-- Tracks are the independent programme lanes used for parallel rooms, stages,
-- and streams. Existing per-session locations become initial track names.
CREATE TABLE "EventScheduleTrack" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventScheduleTrack_pkey" PRIMARY KEY ("id")
);

INSERT INTO "EventScheduleTrack" ("id", "eventId", "name", "sortOrder", "createdAt", "updatedAt")
SELECT
  'track_' || md5("eventId" || ':' || COALESCE(NULLIF(btrim("location"), ''), 'General programme')),
  "eventId",
  COALESCE(NULLIF(btrim("location"), ''), 'General programme'),
  MIN("sortOrder"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "EventSession"
GROUP BY "eventId", COALESCE(NULLIF(btrim("location"), ''), 'General programme');

ALTER TABLE "EventSession" ADD COLUMN "trackId" TEXT;

UPDATE "EventSession" AS session
SET "trackId" = track."id"
FROM "EventScheduleTrack" AS track
WHERE track."eventId" = session."eventId"
  AND track."name" = COALESCE(NULLIF(btrim(session."location"), ''), 'General programme');

ALTER TABLE "EventSession" ALTER COLUMN "trackId" SET NOT NULL;
ALTER TABLE "EventSession" DROP CONSTRAINT IF EXISTS "EventSession_roomId_fkey";
DROP INDEX IF EXISTS "EventSession_roomId_idx";
ALTER TABLE "EventSession" DROP COLUMN "roomId", DROP COLUMN "location";

CREATE UNIQUE INDEX "EventScheduleTrack_eventId_name_key" ON "EventScheduleTrack"("eventId", "name");
CREATE INDEX "EventScheduleTrack_eventId_sortOrder_idx" ON "EventScheduleTrack"("eventId", "sortOrder");
CREATE INDEX "EventSession_trackId_startDateTime_sortOrder_idx" ON "EventSession"("trackId", "startDateTime", "sortOrder");

ALTER TABLE "EventScheduleTrack" ADD CONSTRAINT "EventScheduleTrack_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "EventScheduleTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
