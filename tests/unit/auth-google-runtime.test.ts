import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";

/*
 * Google SSO is instance-managed at runtime: the Auth.js config callback, the
 * sign-in page, and the mobile config must re-read the settings on each
 * request so a super-admin change applies on every replica without a restart.
 */

const mocks = vi.hoisted(() => ({ factory: null as unknown, google: vi.fn(), log: vi.fn() }));
vi.mock("next-auth", () => ({
  default: (factory: unknown) => { mocks.factory = factory; return {}; },
  CredentialsSignin: class extends Error {},
}));
vi.mock("next-auth/providers/google", () => ({ default: (options: object) => ({ id: "google", ...options }) }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: object) => options }));
vi.mock("@/lib/authAdapter", () => ({ authAdapter: {} }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/credentialsAuth", () => ({ verifyPasswordCredentials: vi.fn() }));
vi.mock("@/lib/opsAlerts", () => ({ logOpsError: mocks.log }));
vi.mock("@/lib/instanceSettings", () => ({ getGoogleSsoSettings: mocks.google, isNewUserRegistrationEnabled: vi.fn() }));

import "@/lib/auth";
import { getMobileGoogleConfig, loadGoogleSsoSettings } from "@/lib/googleSignIn";

const config = () => (mocks.factory as () => Promise<NextAuthConfig>)();
const providerIds = async () => (await config()).providers.map((provider) => (provider as { id: string }).id);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runtime Google SSO settings", () => {
  it("is configured with a per-request config callback", () => {
    expect(typeof mocks.factory).toBe("function");
  });

  it("adds, rotates and removes the Google provider as the settings change", async () => {
    mocks.google.mockResolvedValueOnce(null);
    expect(await providerIds()).toEqual(["credentials"]);

    mocks.google.mockResolvedValueOnce({ clientId: "first.apps.googleusercontent.com", clientSecret: "first-secret" });
    expect((await config()).providers[0]).toMatchObject({ id: "google", clientId: "first.apps.googleusercontent.com", clientSecret: "first-secret" });

    mocks.google.mockResolvedValueOnce({ clientId: "second.apps.googleusercontent.com", clientSecret: "second-secret" });
    expect((await config()).providers[0]).toMatchObject({ clientId: "second.apps.googleusercontent.com", clientSecret: "second-secret" });

    mocks.google.mockResolvedValueOnce(null);
    expect(await providerIds()).toEqual(["credentials"]);
    expect(mocks.google).toHaveBeenCalledTimes(4);
  });

  it("keeps password sign-in and sessions working when the Google settings cannot be read", async () => {
    mocks.google.mockRejectedValueOnce(new Error("Unsupported state or unable to authenticate data"));
    expect(await providerIds()).toEqual(["credentials"]);
    expect(mocks.log).toHaveBeenCalledOnce();
    expect(mocks.log.mock.calls[0]?.[1]).toMatchObject({ level: "error", source: "auth" });
  });

  it("does not memoise the settings across calls outside a render", async () => {
    mocks.google.mockResolvedValueOnce({ clientId: "a", clientSecret: "s" }).mockResolvedValueOnce(null);
    await expect(loadGoogleSsoSettings()).resolves.toEqual({ clientId: "a", clientSecret: "s" });
    await expect(loadGoogleSsoSettings()).resolves.toBeNull();
  });

  it("enables mobile Google sign-in only while web Google SSO is configured", async () => {
    mocks.google.mockResolvedValueOnce({ clientId: "web.apps.googleusercontent.com", clientSecret: "s" }).mockResolvedValueOnce(null);
    await expect(getMobileGoogleConfig()).resolves.toMatchObject({ webClientId: "web.apps.googleusercontent.com" });
    await expect(getMobileGoogleConfig()).resolves.toBeNull();
  });
});
