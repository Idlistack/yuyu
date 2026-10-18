import { z } from "zod";
import { verifyPasswordCredentials } from "@/lib/credentialsAuth";
import { issueMobileSession } from "@/lib/mobileAuth";
import { mobileError, mobileOk, readJsonBody } from "@/lib/mobile/http";
import { mobileRoute } from "@/lib/mobile/route";
import { deviceFieldsSchema, sessionDto } from "@/lib/mobile/session";

const INVALID = "Email or password is incorrect.";
const bodySchema = z.object({
  email: z.string().max(254),
  password: z.string().max(128),
  totp: z.string().max(32).optional(),
  ...deviceFieldsSchema,
}).strict();

export const POST = mobileRoute("POST /api/mobile/v1/auth/login", async (request, _params, { baseUrl }) => {
  const body = await readJsonBody(request, 16 * 1024);
  if ("response" in body) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return mobileError("INVALID_REQUEST", INVALID);

  // Same verifier as web sign-in (rate limits, dummy bcrypt, verification, MFA).
  const result = await verifyPasswordCredentials({ email: parsed.data.email, password: parsed.data.password, totp: parsed.data.totp });
  if (!result.ok) {
    if (result.reason === "rate_limited") return mobileError("RATE_LIMITED", "Too many sign-in attempts. Try again shortly.");
    if (result.reason === "mfa_required") return mobileError("MFA_REQUIRED");
    if (result.reason === "email_verification_required") return mobileError("EMAIL_VERIFICATION_REQUIRED");
    return mobileError("INVALID_REQUEST", INVALID);
  }

  const issued = await issueMobileSession({
    userId: result.user.id,
    verifiedSessionVersion: result.user.sessionVersion,
    deviceName: parsed.data.deviceName,
    platform: parsed.data.platform,
    method: "password",
  });
  if (!issued) return mobileError("INVALID_REQUEST", INVALID);
  return mobileOk(await sessionDto(issued, result.user.id, baseUrl));
});
