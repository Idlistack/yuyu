import { withApiMonitoring } from "@/lib/apiMonitor";
import { handlePgIntegrationRequest, listPgEvents, parseListQuery, pgApiError, pgApiJson } from "@/lib/pgIntegration/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Events of enabled organisations, with tombstones, ordered by (updatedAt, key). */
export const GET = withApiMonitoring("GET /api/integrations/pg/v1/events", async (request: Request) =>
  handlePgIntegrationRequest(request, async () => {
    const query = parseListQuery(request);
    if (!query) return pgApiError("INVALID_REQUEST", 400);
    const result = await listPgEvents(query);
    if (result === null) return pgApiError("INVALID_REQUEST", 400);
    if (result === "not_found") return pgApiError("RESOURCE_NOT_FOUND", 404);
    return pgApiJson(result);
  }),
);
