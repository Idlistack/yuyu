-- Managed image fields are served only from the application-controlled upload
-- route. OAuth provider images and Gravatar remain runtime account fallbacks.
UPDATE "Organisation" AS row SET "logoUrl" = NULL
WHERE "logoUrl" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Asset" WHERE row."logoUrl" LIKE '%' || '/api/uploads/' || "key");

UPDATE "Event" AS row SET "coverImageUrl" = NULL
WHERE "coverImageUrl" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Asset" WHERE row."coverImageUrl" LIKE '%' || '/api/uploads/' || "key");

UPDATE "EventPage" AS row SET "logoUrl" = NULL
WHERE "logoUrl" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Asset" WHERE row."logoUrl" LIKE '%' || '/api/uploads/' || "key");

UPDATE "EventSpeaker" AS row SET "photoUrl" = NULL
WHERE "photoUrl" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Asset" WHERE row."photoUrl" LIKE '%' || '/api/uploads/' || "key");

UPDATE "EventSponsor" AS row SET "logoUrl" = NULL
WHERE "logoUrl" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Asset" WHERE row."logoUrl" LIKE '%' || '/api/uploads/' || "key");

UPDATE "User" AS row SET "profileImageUrl" = NULL
WHERE "profileImageUrl" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Asset" WHERE row."profileImageUrl" LIKE '%' || '/api/uploads/' || "key");
