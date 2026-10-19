-- Organiser email broadcasts to selected registrations. Purely additive:
-- one history table plus its enum, indexes, and foreign keys. Delivery rows
-- continue to live in "OutboxMessage" (kind = 'event-broadcast').

-- CreateEnum
CREATE TYPE "BroadcastAttendanceFilter" AS ENUM ('ANY', 'CHECKED_IN', 'NOT_CHECKED_IN');

-- CreateTable
CREATE TABLE "EventBroadcast" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "statuses" "RsvpStatus"[],
    "attendance" "BroadcastAttendanceFilter" NOT NULL DEFAULT 'ANY',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventBroadcast_pkey" PRIMARY KEY ("id")
);

-- A broadcast always targets at least one registration status and never a
-- negative recipient count, even if a future code path skips validation.
ALTER TABLE "EventBroadcast"
  ADD CONSTRAINT "EventBroadcast_statuses_nonempty" CHECK (cardinality("statuses") > 0),
  ADD CONSTRAINT "EventBroadcast_recipientCount_nonnegative" CHECK ("recipientCount" >= 0);

-- CreateIndex
CREATE INDEX "EventBroadcast_eventId_createdAt_idx" ON "EventBroadcast"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "EventBroadcast" ADD CONSTRAINT "EventBroadcast_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBroadcast" ADD CONSTRAINT "EventBroadcast_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
