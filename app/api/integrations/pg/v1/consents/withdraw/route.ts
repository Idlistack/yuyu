import { withApiMonitoring } from "@/lib/apiMonitor";
import { handlePgIntegrationRequest, pgApiError, pgApiJson, readPgJsonBody } from "@/lib/pgIntegration/api";
import { pgConsentWithdrawSchema } from "@/lib/pgIntegration/contract";
import { applyPgWithdrawal } from "@/lib/pgIntegration/selfie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The attendee withdrew face-matching consent inside People's Gallery (docs/PG_INTEGRATION.md#pg-callbacks). */
export const POST = withApiMonitoring("POST /api/integrations/pg/v1/consents/withdraw", async (request: Request) =>
  handlePgIntegrationRequest(request, async ({ integration, subjectOf }) => {
    if (new URL(request.url).searchParams.size > 0) return pgApiError("INVALID_REQUEST", 400);
    const body = await readPgJsonBody(request, pgConsentWithdrawSchema);
    if (!body) return pgApiError("INVALID_REQUEST", 400);
    const result = await applyPgWithdrawal(body, integration, subjectOf);
    if (result.status === 404) return pgApiError("RESOURCE_NOT_FOUND", 404);
    return pgApiJson({ data: { withdrawn: result.withdrawn } });
  }),
);
