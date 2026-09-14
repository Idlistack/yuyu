-- Event publication is the sole public-release control. Align existing website
-- rows with their event status so no organiser has to repeat a release action.
UPDATE "EventPage" AS page
SET "isPublished" = (event."status" = 'PUBLISHED'::"EventStatus")
FROM "Event" AS event
WHERE event."id" = page."eventId"
  AND page."isPublished" IS DISTINCT FROM (event."status" = 'PUBLISHED'::"EventStatus");
