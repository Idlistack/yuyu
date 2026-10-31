import { withApiMonitoring } from "@/lib/apiMonitor";
import { handlePgIntegrationRequest, listPgOrganisations, pgApiError, pgApiJson } from "@/lib/pgIntegration/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Organisations enabled for People's Gallery (docs/PG_INTEGRATION.md#integration-api). */
export const GET = withApiMonitoring("GET /api/integrations/pg/v1/organisations", async (request: Request) =>
  handlePgIntegrationRequest(request, async () => {
    if (new URL(request.url).searchParams.size > 0) return pgApiError("INVALID_REQUEST", 400);
    return pgApiJson(await listPgOrganisations());
  }),
);
