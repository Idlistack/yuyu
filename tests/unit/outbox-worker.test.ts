import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliver: vi.fn(),
  purge: vi.fn(),
  started: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  webhooks: vi.fn(),
  pg: vi.fn(),
}));
vi.mock("@/lib/outbox", () => ({ deliverOutboxBatchWithCount: mocks.deliver }));
vi.mock("@/lib/webhooks/delivery", () => ({ deliverWebhookBatch: mocks.webhooks }));
vi.mock("@/lib/pgIntegration/delivery", () => ({ deliverPgIntegrationBatch: mocks.pg }));
vi.mock("@/lib/retention", () => ({ purgeExpiredOperationalData: mocks.purge }));
vi.mock("@/lib/operationalHeartbeat", () => ({
  recordOutboxSchedulerStarted: mocks.started,
  recordOutboxSchedulerSuccess: mocks.success,
  recordOutboxSchedulerFailure: mocks.failure,
}));

vi.mock("@/lib/opsAlerts", () => ({ logOpsError: vi.fn() }));

import { drainOutbox, OUTBOX_DRAIN_BATCH, PG_INTEGRATION_INTERVAL_MS, runOutboxScheduler, startOutboxWorker } from "@/lib/outboxWorker";

describe("outbox scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.started.mockResolvedValue(undefined);
    mocks.success.mockResolvedValue(undefined);
    mocks.failure.mockResolvedValue(undefined);
    mocks.deliver.mockResolvedValue({ sent: 2, failed: 0, due: 2 });
    mocks.purge.mockResolvedValue({ verificationTokens: 1 });
    mocks.webhooks.mockResolvedValue({ delivered: 1, failed: 0 });
    mocks.pg.mockResolvedValue({ delivered: 3, failed: 0 });
  });

  it("does not make heartbeat observability a delivery dependency", async () => {
    mocks.started.mockRejectedValue(new Error("heartbeat unavailable"));
    mocks.success.mockRejectedValue(new Error("heartbeat unavailable"));
    await expect(runOutboxScheduler()).resolves.toMatchObject({ sent: 2, failed: 0 });
    expect(mocks.deliver).toHaveBeenCalled();
    expect(mocks.purge).toHaveBeenCalled();
  });

  it("records a metadata-only scheduler failure and rethrows for the protected route", async () => {
    const error = new Error("delivery failed");
    mocks.deliver.mockRejectedValue(error);
    await expect(runOutboxScheduler()).rejects.toBe(error);
    expect(mocks.failure).toHaveBeenCalledWith(error);
    expect(mocks.purge).not.toHaveBeenCalled();
  });

  it("runs organisation webhook deliveries in the same pass without letting them fail it", async () => {
    await expect(runOutboxScheduler()).resolves.toMatchObject({ sent: 2, webhooks: { delivered: 1, failed: 0 } });
    mocks.webhooks.mockRejectedValue(new Error("webhook table unavailable"));
    await expect(runOutboxScheduler()).resolves.toMatchObject({ sent: 2, webhooks: { delivered: 0, failed: 0 } });
    expect(mocks.purge).toHaveBeenCalledTimes(2);
    expect(mocks.failure).not.toHaveBeenCalled();
  });

  it("runs People's Gallery integration deliveries in the same pass without letting them fail it", async () => {
    await expect(runOutboxScheduler()).resolves.toMatchObject({ sent: 2, pgIntegration: { delivered: 3, failed: 0 } });
    mocks.pg.mockRejectedValue(new Error("integration table unavailable"));
    await expect(runOutboxScheduler()).resolves.toMatchObject({ sent: 2, pgIntegration: { delivered: 0, failed: 0 } });
    expect(mocks.purge).toHaveBeenCalledTimes(2);
    expect(mocks.failure).not.toHaveBeenCalled();
  });
});

describe("outbox drain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps delivering full batches until the queue is empty", async () => {
    mocks.deliver
      .mockResolvedValueOnce({ sent: 50, failed: 0, due: 50 })
      .mockResolvedValueOnce({ sent: 49, failed: 1, due: 50 })
      .mockResolvedValueOnce({ sent: 12, failed: 0, due: 12 });
    await expect(drainOutbox({ batch: 50, budgetMs: 60_000 })).resolves.toEqual({ sent: 111, failed: 1 });
    expect(mocks.deliver).toHaveBeenCalledTimes(3);
    expect(mocks.deliver).toHaveBeenCalledWith(50);
  });

  it("stops when the time budget is spent, leaving the rest for the next pass", async () => {
    let clock = 0;
    mocks.deliver.mockImplementation(async () => {
      clock += 15_000;
      return { sent: 50, failed: 0, due: 50 };
    });
    await expect(drainOutbox({ batch: 50, budgetMs: 40_000, now: () => clock })).resolves.toEqual({ sent: 150, failed: 0 });
    expect(mocks.deliver).toHaveBeenCalledTimes(3);
  });

  it("keeps draining past batches that contained dropped messages", async () => {
    mocks.deliver
      .mockResolvedValueOnce({ sent: 44, failed: 0, due: 50 })
      .mockResolvedValueOnce({ sent: 0, failed: 0, due: 50 })
      .mockResolvedValueOnce({ sent: 7, failed: 0, due: 7 });
    await expect(drainOutbox({ batch: 50, budgetMs: 60_000 })).resolves.toEqual({ sent: 51, failed: 0 });
    expect(mocks.deliver).toHaveBeenCalledTimes(3);
  });

  it("backs off after a batch in which every send failed (mail server down)", async () => {
    mocks.deliver.mockResolvedValue({ sent: 0, failed: 50, due: 50 });
    await expect(drainOutbox({ batch: 50, budgetMs: 60_000 })).resolves.toEqual({ sent: 0, failed: 50 });
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
  });

  it("drains in the scheduler pass instead of a single fixed batch", async () => {
    mocks.started.mockResolvedValue(undefined);
    mocks.success.mockResolvedValue(undefined);
    mocks.purge.mockResolvedValue({});
    mocks.webhooks.mockResolvedValue({ delivered: 0, failed: 0 });
    mocks.deliver
      .mockResolvedValueOnce({ sent: OUTBOX_DRAIN_BATCH, failed: 0, due: OUTBOX_DRAIN_BATCH })
      .mockResolvedValueOnce({ sent: 3, failed: 0, due: 3 });
    await expect(runOutboxScheduler()).resolves.toMatchObject({ sent: OUTBOX_DRAIN_BATCH + 3, failed: 0 });
    expect(mocks.deliver).toHaveBeenCalledTimes(2);
  });
});

describe("outbox worker timers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete (globalThis as { __yuyuOutboxWorker?: unknown }).__yuyuOutboxWorker;
    mocks.started.mockResolvedValue(undefined);
    mocks.success.mockResolvedValue(undefined);
    mocks.deliver.mockResolvedValue({ sent: 0, failed: 0, due: 0 });
    mocks.purge.mockResolvedValue({});
    mocks.webhooks.mockResolvedValue({ delivered: 0, failed: 0 });
    mocks.pg.mockResolvedValue({ delivered: 0, failed: 0 });
  });

  afterEach(() => {
    const state = (globalThis as { __yuyuOutboxWorker?: { timer?: ReturnType<typeof setInterval>; pgTimer?: ReturnType<typeof setInterval> } }).__yuyuOutboxWorker;
    clearInterval(state?.timer);
    clearInterval(state?.pgTimer);
    delete (globalThis as { __yuyuOutboxWorker?: unknown }).__yuyuOutboxWorker;
    vi.useRealTimers();
  });

  it("delivers to People's Gallery every 10 seconds, well inside the one-minute pass", async () => {
    expect(PG_INTEGRATION_INTERVAL_MS).toBeLessThanOrEqual(15_000);
    startOutboxWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.pg).toHaveBeenCalledTimes(1); // the first full pass
    await vi.advanceTimersByTimeAsync(PG_INTEGRATION_INTERVAL_MS * 3);
    expect(mocks.pg).toHaveBeenCalledTimes(4);
    expect(mocks.deliver).toHaveBeenCalledTimes(1); // emails keep the one-minute cadence
  });

  it("never overlaps two People's Gallery passes and survives a failing one", async () => {
    let release: () => void = () => undefined;
    mocks.pg.mockResolvedValueOnce({ delivered: 0, failed: 0 })
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ delivered: 0, failed: 0 }); }))
      .mockRejectedValueOnce(new Error("integration table unavailable"));
    startOutboxWorker();
    await vi.advanceTimersByTimeAsync(PG_INTEGRATION_INTERVAL_MS); // tick 1 hangs
    await vi.advanceTimersByTimeAsync(PG_INTEGRATION_INTERVAL_MS * 2); // skipped while it runs
    expect(mocks.pg).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(PG_INTEGRATION_INTERVAL_MS); // fails
    await vi.advanceTimersByTimeAsync(PG_INTEGRATION_INTERVAL_MS); // and the next one still runs
    expect(mocks.pg).toHaveBeenCalledTimes(4);
  });

  it("starts one set of timers per process", async () => {
    startOutboxWorker();
    startOutboxWorker();
    await vi.advanceTimersByTimeAsync(PG_INTEGRATION_INTERVAL_MS);
    expect(mocks.pg).toHaveBeenCalledTimes(2);
  });
});
