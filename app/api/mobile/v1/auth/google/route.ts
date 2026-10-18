import { z } from "zod";
import { completeGoogleSignIn, evaluateGoogleSignIn, getMobileGoogleConfig, verifyGoogleIdToken } from "@/lib/googleSignIn";
import { issueMobileSession } from "@/lib/mobileAuth";
import { mobileError, mobileOk, readJsonBody } from "@/lib/mobile/http";
import { mobileRoute } from "@/lib/mobile/route";
import { deviceFieldsSchema, sessionDto } from "@/lib/mobile/session";

const bodySchema = z.object({
  idToken: z.string().min(1).max(8192),
  ...deviceFieldsSchema,
}).strict();

const REJECTED = "Google sign-in could not be completed.";

export const POST = mobileRoute("POST /api/mobile/v1/auth/google", async (request, _params, { baseUrl }) => {
  const body = await readJsonBody(request, 16 * 1024);
  if ("response" in body) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return mobileError("INVALID_REQUEST");

  const config = await getMobileGoogleConfig();
  if (!config) return mobileError("FORBIDDEN", "Google sign-in is not available on this Yuyu instance.");

  const identity = await verifyGoogleIdToken(parsed.data.idToken, config.audiences);
  if (!identity) return mobileError("UNAUTHENTICATED", REJECTED);

  // Same linking and account-creation policy as web Google sign-in.
  const decision = await evaluateGoogleSignIn({ email: identity.email, emailVerified: true, providerAccountId: identity.sub });
  if (decision === "account_creation_disabled") return mobileError("FORBIDDEN", "New account creation is currently unavailable.");
  if (decision === "deny") return mobileError("FORBIDDEN", REJECTED);

  const user = await completeGoogleSignIn(identity);
  if (!user) return mobileError("FORBIDDEN", REJECTED);
  const issued = await issueMobileSession({
    userId: user.id,
    verifiedSessionVersion: user.sessionVersion,
    deviceName: parsed.data.deviceName,
    platform: parsed.data.platform,
    method: "google",
  });
  if (!issued) return mobileError("UNAUTHENTICATED", REJECTED);
  return mobileOk(await sessionDto(issued, user.id, baseUrl));
});
