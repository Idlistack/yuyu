import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  verification: vi.fn(),
  session: vi.fn(),
  orgInvite: vi.fn(),
  collaboratorInvite: vi.fn(),
  undo: vi.fn(),
  outbox: vi.fn(),
  mobileSession: vi.fn(),
  webhookDelivery: vi.fn(),
  oauthCode: vi.fn(),
  oauthSession: vi.fn(),
  clientToken: vi.fn(),
  pgDelivery: vi.fn(),
  pgResource: vi.fn(),
  pgSelfieTicket: vi.fn(),
  pgReceipt: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: {
  $transaction: mocks.transaction,
  verificationToken: { deleteMany: mocks.verification },
  session: { deleteMany: mocks.session },
  organisationInvite: { deleteMany: mocks.orgInvite },
  eventCollaboratorInvite: { deleteMany: mocks.collaboratorInvite },
  rsvpDeletionUndo: { deleteMany: mocks.undo },
  outboxMessage: { deleteMany: mocks.outbox },
  mobileSession: { deleteMany: mocks.mobileSession },
  webhookDelivery: { deleteMany: mocks.webhookDelivery },
  oAuthAuthorizationCode: { deleteMany: mocks.oauthCode },
  oAuthSession: { deleteMany: mocks.oauthSession },
  oAuthClientToken: { deleteMany: mocks.clientToken },
  pgIntegrationDelivery: { deleteMany: mocks.pgDelivery },
  pgIntegrationResource: { deleteMany: mocks.pgResource },
  pgSelfieTicket: { deleteMany: mocks.pgSelfieTicket },
  pgNotificationReceipt: { deleteMany: mocks.pgReceipt },
} }));

import { purgeExpiredOperationalData } from "@/lib/retention";

const previousRetention = process.env.OUTBOX_RETENTION_DAYS;

describe("operational retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OUTBOX_RETENTION_DAYS = "30";
    for (const mock of [mocks.verification, mocks.session, mocks.orgInvite, mocks.collaboratorInvite, mocks.undo, mocks.outbox, mocks.mobileSession, mocks.webhookDelivery, mocks.oauthCode, mocks.oauthSession, mocks.clientToken, mocks.pgDelivery, mocks.pgResource, mocks.pgSelfieTicket, mocks.pgReceipt]) {
      mock.mockResolvedValue({ count: 1 });
    }
    mocks.transaction.mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations));
  });

  afterEach(() => {
    if (previousRetention === undefined) delete process.env.OUTBOX_RETENTION_DAYS;
    else process.env.OUTBOX_RETENTION_DAYS = previousRetention;
  });

  it("purges expired capabilities/sessions and both sent and failed queue history", async () => {
    const now = new Date("2030-03-01T00:00:00.000Z");
    await expect(purgeExpiredOperationalData(now)).resolves.toEqual({
      verificationTokens: 1,
      expiredSessions: 1,
      unusedOrganisationInvites: 1,
      unusedCollaboratorInvites: 1,
      undoSnapshots: 1,
      sentOutboxMessages: 1,
      failedOutboxMessages: 1,
      mobileSessions: 1,
      webhookDeliveries: 1,
      oauthAuthorizationCodes: 1,
      oauthSessions: 1,
      oauthClientTokens: 1,
      pgIntegrationDeliveries: 1,
      pgIntegrationTombstones: 1,
      pgSelfieTickets: 1,
      pgNotificationReceipts: 1,
    });
    expect(mocks.orgInvite).toHaveBeenCalledWith({ where: { usedAt: null, expiresAt: { lt: now } } });
    expect(mocks.collaboratorInvite).toHaveBeenCalledWith({ where: { usedAt: null, expiresAt: { lt: now } } });
    expect(mocks.outbox).toHaveBeenNthCalledWith(1, { where: { status: OutboxStatus.SENT, sentAt: { lt: new Date("2030-01-30T00:00:00.000Z") } } });
    expect(mocks.outbox).toHaveBeenNthCalledWith(2, { where: { status: OutboxStatus.FAILED, createdAt: { lt: new Date("2030-01-30T00:00:00.000Z") } } });
    // Webhook delivery history is kept for 30 days whatever OUTBOX_RETENTION_DAYS says; live leases are never purged.
    expect(mocks.webhookDelivery).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2030-01-30T00:00:00.000Z") }, status: { not: "PROCESSING" } } });
    // OIDC codes a day after expiry; OAuth sessions once unrefreshable or revoked 30 days ago.
    expect(mocks.oauthCode).toHaveBeenCalledWith({ where: { expiresAt: { lt: new Date("2030-02-28T00:00:00.000Z") } } });
    // People's Gallery integration: finished deliveries and tombstones after 30 days; queued rows stay.
    expect(mocks.clientToken).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
    expect(mocks.pgDelivery).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2030-01-30T00:00:00.000Z") }, status: { in: ["SUCCEEDED", "FAILED"] } } });
    expect(mocks.pgResource).toHaveBeenCalledWith({ where: { deletedAt: { lt: new Date("2030-01-30T00:00:00.000Z") } } });
    // Selfie ticket ids a day after expiry; notification idempotency receipts after 7 days.
    expect(mocks.pgSelfieTicket).toHaveBeenCalledWith({ where: { expiresAt: { lt: new Date("2030-02-28T00:00:00.000Z") } } });
    expect(mocks.pgReceipt).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2030-02-22T00:00:00.000Z") } } });
    expect(mocks.oauthSession).toHaveBeenCalledWith({ where: { OR: [{ refreshExpiresAt: { lt: now } }, { revokedAt: { lt: new Date("2030-01-30T00:00:00.000Z") } }] } });
  });
});
