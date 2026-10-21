import "server-only";

import nodemailer from "nodemailer";
import { getEmailSettings } from "@/lib/instanceSettings";

const SMTP_CONNECTION_TIMEOUT_MS = 30_000;
const SMTP_GREETING_TIMEOUT_MS = 30_000;
const SMTP_SOCKET_TIMEOUT_MS = 60_000;

export class EmailTransportUnavailableError extends Error {
  override name = "EmailTransportUnavailableError";

  constructor() {
    super("Transactional email transport is not configured.");
  }
}

export class EmailRecipientRejectedError extends Error {
  override name = "EmailRecipientRejectedError";

  constructor() {
    super("SMTP rejected the recipient.");
  }
}

export function assertEmailAccepted(result: { accepted?: unknown; rejected?: unknown }) {
  if (
    (Array.isArray(result.rejected) && result.rejected.length > 0) ||
    (Array.isArray(result.accepted) && result.accepted.length === 0)
  ) {
    throw new EmailRecipientRejectedError();
  }
}

/**
 * Build a fresh transport for each send from settings read at send time. There
 * is deliberately no module-level cache: a super-admin change applies on the
 * next send on every replica and worker without a restart.
 */
export async function getEmailTransport(options: { timeoutMs?: number } = {}) {
  const settings = await getEmailSettings();
  const production = process.env.NODE_ENV === "production";
  // Same explicit CI/staging bypass as lib/env.ts (e.g. Mailpit on plain port
  // 1025). Real production always requires verified TLS 1.2+.
  const insecureCiTest = process.env.CI === "true" && process.env.ALLOW_INSECURE_PRODUCTION_TESTS === "1";
  const enforceTls = production && !insecureCiTest;
  const tls = enforceTls ? { minVersion: "TLSv1.2" as const, rejectUnauthorized: true } : undefined;
  const requireTLS = enforceTls && !settings.secure;
  if (!settings.service && !settings.host) {
    if (production) throw new EmailTransportUnavailableError();
    return { from: settings.from, transporter: null, source: settings.source };
  }
  const auth = settings.user && settings.password ? { user: settings.user, pass: settings.password } : undefined;
  // Production SMTP is authenticated unless a private relay was explicitly allowed.
  if (production && !auth && !settings.allowUnauthenticated) throw new EmailTransportUnavailableError();
  const timeouts = {
    connectionTimeout: Math.min(options.timeoutMs ?? SMTP_CONNECTION_TIMEOUT_MS, SMTP_CONNECTION_TIMEOUT_MS),
    greetingTimeout: Math.min(options.timeoutMs ?? SMTP_GREETING_TIMEOUT_MS, SMTP_GREETING_TIMEOUT_MS),
    socketTimeout: Math.min(options.timeoutMs ?? SMTP_SOCKET_TIMEOUT_MS, SMTP_SOCKET_TIMEOUT_MS),
  };
  const common = { auth, disableFileAccess: true, disableUrlAccess: true, requireTLS, tls, ...timeouts };
  return {
    from: settings.from,
    source: settings.source,
    transporter: settings.service
      ? nodemailer.createTransport({ service: settings.service, ...common })
      : nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure, ...common }),
  };
}
