import { withApiMonitoring } from "@/lib/apiMonitor";
import { handlePgIntegrationRequest, pgApiError, pgApiJson, readPgJsonBody } from "@/lib/pgIntegration/api";
import { pgEnrollmentStatusSchema } from "@/lib/pgIntegration/contract";
import { applyEnrollmentStatus } from "@/lib/pgIntegration/selfie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * People's Gallery reports a selfie upload (added / rejected) or a removal
 * (docs/PG_INTEGRATION.md#pg-callbacks). Each ticket `jti` confirms one
 * enrollment only. No image data is ever sent here.
 */
export const POST = withApiMonitoring("POST /api/integrations/pg/v1/enrollments/status", async (request: Request) =>
  handlePgIntegrationRequest(request, async ({ subjectOf }) => {
    if (new URL(request.url).searchParams.size > 0) return pgApiError("INVALID_REQUEST", 400);
    const body = await readPgJsonBody(request, pgEnrollmentStatusSchema);
    if (!body) return pgApiError("INVALID_REQUEST", 400);
    const result = await applyEnrollmentStatus(body, subjectOf);
    if (result.status === 404) return pgApiError("RESOURCE_NOT_FOUND", 404);
    if (result.status === 409) return pgApiError("TICKET_USED", 409);
    return pgApiJson({ data: { selfieState: result.selfieState } });
  }),
);
