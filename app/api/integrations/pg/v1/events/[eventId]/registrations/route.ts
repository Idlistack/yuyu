import { withApiMonitoring } from "@/lib/apiMonitor";
import { apiResourceIdSchema } from "@/lib/api/v1/schemas";
import { handlePgIntegrationRequest, listPgRegistrations, parseListQuery, pgApiError, pgApiJson } from "@/lib/pgIntegration/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ eventId: string }> };

/** Registrations of one event (pairwise subjects, tombstones included). */
export const GET = withApiMonitoring("GET /api/integrations/pg/v1/events/:eventId/registrations", async (request: Request, routeContext: Context) =>
  handlePgIntegrationRequest(request, async (context) => {
    const eventId = apiResourceIdSchema.safeParse((await routeContext.params).eventId);
    const query = parseListQuery(request);
    if (!eventId.success || !query) return pgApiError("INVALID_REQUEST", 400);
    const result = await listPgRegistrations(eventId.data, query, context.subjectOf);
    if (result === null) return pgApiError("INVALID_REQUEST", 400);
    if (result === "not_found") return pgApiError("RESOURCE_NOT_FOUND", 404);
    return pgApiJson(result);
  }),
);
