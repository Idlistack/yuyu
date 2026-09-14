-- Replace the room/track editing model with a single plain-text session location.
ALTER TABLE "EventSession" RENAME COLUMN "track" TO "location";

UPDATE "EventSession" AS session
SET "location" = room."name"
FROM "EventVenueRoom" AS room
WHERE session."location" IS NULL
  AND session."roomId" = room."id";

ALTER TABLE "EventSession" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "EventSession" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;
ALTER TABLE "EventSession" ALTER COLUMN "type" SET DEFAULT 'Talk';
