import "server-only";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { prisma } from "@/lib/db";
import { consumeMfaCode, consumeRecoveryCode, decryptMfaSecret } from "@/lib/mfa";

/*
 * Email + password verification shared by the web Auth.js Credentials
 * provider and mobile sign-in, so both apply the same rate limits, equal-work
 * bcrypt comparison, inbox-verification gate and MFA/recovery-code rules.
 */

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  totp: z.string().trim().max(32).optional(),
});

// Equal bcrypt work for missing and OAuth-only accounts prevents the obvious
// timing oracle. This is a fixed non-secret dummy hash.
const DUMMY_HASH = "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";

export type VerifiedCredentialUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  sessionVersion: number;
};

export type CredentialVerification =
  | { ok: true; user: VerifiedCredentialUser }
  /** Malformed input or a wrong email, password or second factor. Never more specific. */
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "rate_limited" }
  /** Only after a correct password. */
  | { ok: false; reason: "mfa_required" }
  /** Only after a correct password. */
  | { ok: false; reason: "email_verification_required" };

export async function verifyPasswordCredentials(raw: unknown): Promise<CredentialVerification> {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, password } = parsed.data;
  if (await isActionRateLimited("auth", email)) return { ok: false, reason: "rate_limited" };

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      passwordHash: true,
      sessionVersion: true,
      emailVerified: true,
      mfaSecretEncrypted: true,
    },
  });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !ok) return { ok: false, reason: "invalid" };
  if (!user.emailVerified) return { ok: false, reason: "email_verification_required" };

  if (user.mfaSecretEncrypted) {
    const code = parsed.data.totp ?? "";
    if (!user.email) return { ok: false, reason: "invalid" };
    if (!code) return { ok: false, reason: "mfa_required" };
    const validTotp = await consumeMfaCode(decryptMfaSecret(user.mfaSecretEncrypted), user.email, code);
    if (!validTotp && !(await consumeRecoveryCode(user.id, code))) return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      sessionVersion: user.sessionVersion,
    },
  };
}
