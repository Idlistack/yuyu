"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import {
  issueAuthorizationCode,
  recordConsentDenied,
  redirectWith,
  revokeConnectedApp,
  validateAuthorizeRequest,
} from "@/lib/oidc/provider";
import type { ActionResult } from "./org";

/*
 * The one-time authorisation screen (/oauth/consent) and "Connected apps" in
 * Account → Security. The consent decision re-validates the whole
 * authorization request on the server: nothing the browser sends beyond the
 * original query string is trusted, and the user comes only from the session.
 */

const querySchema = z.string().max(6000);
const grantIdSchema = z.object({ grantId: z.string().min(1).max(64).regex(/^[a-z0-9]+$/) }).strict();

async function decide(query: unknown, approve: boolean): Promise<ActionResult<{ redirectTo: string }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Your Yuyu session has ended. Sign in again." };
  if (await isActionRateLimited("oauthAuthorize", userId)) return { ok: false, error: "Too many attempts. Please try again later." };
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return { ok: false, error: "This sign-in request is no longer valid." };
  const validation = await validateAuthorizeRequest(new URLSearchParams(parsed.data));
  if (validation.kind === "fatal") return { ok: false, error: validation.message };
  if (validation.kind === "redirect_error") {
    return { ok: true, data: { redirectTo: redirectWith(validation.redirectUri, { error: validation.error, error_description: validation.description, state: validation.state }) } };
  }
  const { request } = validation;
  if (!approve) {
    await recordConsentDenied(userId, request.client);
    return { ok: true, data: { redirectTo: redirectWith(request.redirectUri, { error: "access_denied", state: request.state }) } };
  }
  const authenticatedAt = (session as typeof session & { authenticatedAt?: number }).authenticatedAt;
  const redirectTo = await issueAuthorizationCode({
    request,
    userId,
    authTime: new Date(typeof authenticatedAt === "number" ? authenticatedAt : Date.now()),
    approve: true,
  });
  if (!redirectTo) return { ok: false, error: "Your account changed while signing in. Start again from the app." };
  return { ok: true, data: { redirectTo } };
}

/** "Allow": record the grant and return to the app with a one-time code. */
export async function approveOAuthConsent(query: unknown) {
  return decide(query, true);
}

/** "Cancel": return to the app with `access_denied`; nothing is stored. */
export async function denyOAuthConsent(query: unknown) {
  return decide(query, false);
}

/** Disconnect an app from Account → Security: revokes the grant and its tokens. */
export async function disconnectOAuthApp(input: unknown): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in again." };
  if (await isActionRateLimited("auth", userId)) return { ok: false, error: "Too many attempts. Please try again later." };
  const parsed = grantIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This app is not connected." };
  const revoked = await revokeConnectedApp(userId, parsed.data.grantId);
  return revoked ? { ok: true } : { ok: false, error: "This app is not connected." };
}
