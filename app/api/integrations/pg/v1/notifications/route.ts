import crypto from "node:crypto";
import { withApiMonitoring } from "@/lib/apiMonitor";
import { checkRateLimitById } from "@/lib/rateLimit";
import { handlePgIntegrationRequest, pgApiError, pgApiJson, readPgJsonBody } from "@/lib/pgIntegration/api";
import { idempotencyKeySchema, pgNotificationRequestSchema } from "@/lib/pgIntegration/contract";
import { acceptPgNotification } from "@/lib/pgIntegration/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * People's Gallery asks Yuyu to tell attendees their photos are ready
 * (plan §5.7, decision D-Mail; docs/PG_INTEGRATION.md#attendee-notifications).
 * Idempotent per Idempotency-Key for 7 days.
 */
export const POST = withApiMonitoring("POST /api/integrations/pg/v1/notifications", async (request: Request) =>
  handlePgIntegrationRequest(request, async ({ integration, subjectOf }) => {
    if (new URL(request.url).searchParams.size > 0) return pgApiError("INVALID_REQUEST", 400);
    const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key") ?? "");
    if (!key.success) return pgApiError("INVALID_REQUEST", 400);
    const bucket = `pg-notify:${crypto.createHash("sha256").update(integration.oauthClient.id).digest("hex").slice(0, 32)}`;
    if (!(await checkRateLimitById("pgNotifications", bucket))) return pgApiError("RATE_LIMITED", 429, 60);
    const body = await readPgJsonBody(request, pgNotificationRequestSchema);
    if (!body) return pgApiError("INVALID_REQUEST", 400);
    const result = await acceptPgNotification({ idempotencyKey: key.data, body, integration, subjectOf });
    if (result.status === 400) return pgApiError("INVALID_REQUEST", 400);
    if (result.status === 404) return pgApiError("RESOURCE_NOT_FOUND", 404);
    if (result.status === 409) return pgApiError("IDEMPOTENCY_CONFLICT", 409);
    return pgApiJson(result.body, 202);
  }),
);
