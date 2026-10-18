import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import {
  generateMobileTokenPair,
  hashMobileToken,
  isAccessUsable,
  isRefreshTokenShape,
  isRefreshUsable,
  parseMobileBearer,
} from "@/lib/mobile/tokens";

/*
 * Mobile app sessions (Android and iOS). These are individual Yuyu users, not
 * machine clients: every request resolves the user and then applies the same
 * permission helpers as the website. Tokens are never logged or audited.
 */

export type MobilePlatform = "android" | "ios";

export type IssuedMobileSession = {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export type MobileAuthContext = {
  userId: string;
  sessionId: string;
};

const LAST_USED_THROTTLE_MS = 5 * 60_000;

/**
 * Create a session bound to the `sessionVersion` that was current when the
 * credential was verified. A password reset or "sign out everywhere" racing
 * the sign-in must not mint a session from the old proof, exactly like the
 * web JWT callback.
 */
export async function issueMobileSession(params: {
  userId: string;
  verifiedSessionVersion: number;
  deviceName?: string | null;
  platform?: MobilePlatform | null;
  method: "password" | "google";
}): Promise<IssuedMobileSession | null> {
  const tokens = generateMobileTokenPair();
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: params.userId }, select: { sessionVersion: true } });
    if (!user || user.sessionVersion !== params.verifiedSessionVersion) return null;
    const session = await tx.mobileSession.create({
      data: {
        userId: params.userId,
        accessTokenHash: tokens.accessTokenHash,
        refreshTokenHash: tokens.refreshTokenHash,
        sessionVersion: user.sessionVersion,
        deviceName: params.deviceName?.trim() || null,
        platform: params.platform ?? null,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      },
      select: { id: true },
    });
    await recordAuditEvent({
      action: "MOBILE_SIGNED_IN",
      actorUserId: params.userId,
      targetType: "MobileSession",
      targetId: session.id,
      metadata: { method: params.method, platform: params.platform ?? null },
      client: tx,
    });
    return session;
  });
  if (!created) return null;
  return {
    sessionId: created.id,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessExpiresAt,
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshExpiresAt,
  };
}

export type RefreshOutcome =
  | { ok: true; userId: string; session: IssuedMobileSession }
  | { ok: false; reason: "invalid" | "reused" };

/**
 * Rotate a refresh token. Presenting the refresh token that was already
 * rotated away revokes the whole session (the token was copied), and every
 * failure is reported to the client the same way.
 */
export async function refreshMobileSession(refreshToken: string): Promise<RefreshOutcome> {
  if (!isRefreshTokenShape(refreshToken)) return { ok: false, reason: "invalid" };
  const presentedHash = hashMobileToken(refreshToken);
  const now = new Date();

  const session = await prisma.mobileSession.findUnique({
    where: { refreshTokenHash: presentedHash },
    select: {
      id: true, userId: true, revokedAt: true, accessExpiresAt: true, refreshExpiresAt: true,
      sessionVersion: true, user: { select: { sessionVersion: true } },
    },
  });

  if (!session) {
    const replayed = await prisma.mobileSession.findUnique({
      where: { previousRefreshTokenHash: presentedHash },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (replayed && !replayed.revokedAt) {
      await prisma.$transaction(async (tx) => {
        const revoked = await tx.mobileSession.updateMany({
          where: { id: replayed.id, revokedAt: null },
          data: { revokedAt: now },
        });
        if (revoked.count === 1) {
          await recordAuditEvent({
            action: "MOBILE_REFRESH_TOKEN_REUSED",
            actorUserId: replayed.userId,
            targetType: "MobileSession",
            targetId: replayed.id,
            client: tx,
          });
        }
      });
      return { ok: false, reason: "reused" };
    }
    return { ok: false, reason: "invalid" };
  }

  if (!isRefreshUsable(session, session.user.sessionVersion, now)) return { ok: false, reason: "invalid" };

  const tokens = generateMobileTokenPair(now);
  // The refresh-token hash in the predicate makes rotation single-winner when
  // two requests race with the same token.
  const rotated = await prisma.mobileSession.updateMany({
    where: { id: session.id, refreshTokenHash: presentedHash, revokedAt: null, sessionVersion: session.user.sessionVersion },
    data: {
      accessTokenHash: tokens.accessTokenHash,
      refreshTokenHash: tokens.refreshTokenHash,
      previousRefreshTokenHash: presentedHash,
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      lastUsedAt: now,
    },
  });
  if (rotated.count !== 1) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    userId: session.userId,
    session: {
      sessionId: session.id,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessExpiresAt,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshExpiresAt,
    },
  };
}

/**
 * Authenticate a mobile request from its bearer access token. Expired,
 * revoked, unknown and version-stale tokens all return null so callers send
 * one generic 401.
 */
export async function requireMobileUser(request: Request): Promise<MobileAuthContext | null> {
  const token = parseMobileBearer(request.headers.get("authorization"));
  if (!token) return null;
  const session = await prisma.mobileSession.findUnique({
    where: { accessTokenHash: hashMobileToken(token) },
    select: {
      id: true, userId: true, revokedAt: true, accessExpiresAt: true, refreshExpiresAt: true,
      sessionVersion: true, lastUsedAt: true, user: { select: { sessionVersion: true } },
    },
  });
  const now = new Date();
  if (!session || !isAccessUsable(session, session.user.sessionVersion, now)) return null;

  if (now.getTime() - session.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    try {
      await prisma.mobileSession.updateMany({
        where: { id: session.id, lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_THROTTLE_MS) } },
        data: { lastUsedAt: now },
      });
    } catch {
      // Usage tracking is best effort and never changes authentication.
    }
  }
  return { userId: session.userId, sessionId: session.id };
}

/** Optional identity for public routes: a bearer, if sent and valid, identifies the attendee. */
export async function optionalMobileUser(request: Request): Promise<MobileAuthContext | null> {
  if (!request.headers.get("authorization")) return null;
  return requireMobileUser(request);
}

export async function revokeMobileSession(context: MobileAuthContext) {
  await prisma.$transaction(async (tx) => {
    const revoked = await tx.mobileSession.updateMany({
      where: { id: context.sessionId, userId: context.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 1) {
      await recordAuditEvent({
        action: "MOBILE_SIGNED_OUT",
        actorUserId: context.userId,
        targetType: "MobileSession",
        targetId: context.sessionId,
        client: tx,
      });
    }
  });
}

/**
 * Mark every live mobile session of a user revoked. Bumping `sessionVersion`
 * already invalidates them; this keeps the rows truthful for support and
 * retention. Call inside the transaction that bumps the version.
 */
export function revokeUserMobileSessions(client: Prisma.TransactionClient, userId: string) {
  return client.mobileSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
