import { withApiMonitoring } from "@/lib/apiMonitor";
import { apiResourceIdSchema } from "@/lib/api/v1/schemas";
import { handlePgIntegrationRequest, listPgEventRoles, parseListQuery, pgApiError, pgApiJson } from "@/lib/pgIntegration/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ eventId: string }> };

/** Organisation and collaborator role facts for one event, with the D-2 mapping applied. */
export const GET = withApiMonitoring("GET /api/integrations/pg/v1/events/:eventId/roles", async (request: Request, routeContext: Context) =>
  handlePgIntegrationRequest(request, async (context) => {
    const eventId = apiResourceIdSchema.safeParse((await routeContext.params).eventId);
    const query = parseListQuery(request);
    if (!eventId.success || !query) return pgApiError("INVALID_REQUEST", 400);
    const result = await listPgEventRoles(eventId.data, query, context.subjectOf);
    if (result === null) return pgApiError("INVALID_REQUEST", 400);
    if (result === "not_found") return pgApiError("RESOURCE_NOT_FOUND", 404);
    return pgApiJson(result);
  }),
);
