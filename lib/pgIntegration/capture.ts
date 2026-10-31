import "server-only";

import type { Prisma } from "@prisma/client";

/*
 * Capture of People's Gallery integration events happens in database
 * triggers (migration 20261031010000_pg_integration), in the same transaction
 * as the change. A deleted RSVP is reported as CANCELLED unless the deleting
 * transaction marks it as an organiser removal with this helper first.
 */
export async function markRsvpDeletionAsRemovalTx(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT set_config('yuyu.pg_rsvp_delete_status', 'REMOVED', true)`;
}
