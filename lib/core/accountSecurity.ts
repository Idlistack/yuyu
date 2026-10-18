import "server-only";

import { prisma } from "@/lib/db";
import { revokeUserMobileSessions } from "@/lib/mobileAuth";

/**
 * "Sign out everywhere": bump the session version (invalidating every web JWT
 * and mobile session), drop pending MFA setup and adapter sessions, mark
 * mobile sessions revoked and audit. Callers own authentication, recent-auth
 * and rate-limit checks.
 */
export async function revokeAllSessionsForUser(userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await tx.verificationToken.deleteMany({ where: { identifier: `mfa:${userId}` } });
    await tx.session.deleteMany({ where: { userId } });
    await revokeUserMobileSessions(tx, userId);
    await tx.auditEvent.create({ data: { action: "SESSIONS_REVOKED", actorUserId: userId, targetType: "User", targetId: userId } });
  });
}
