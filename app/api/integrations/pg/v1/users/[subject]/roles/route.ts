import { withApiMonitoring } from "@/lib/apiMonitor";
import { handlePgIntegrationRequest, pgApiError, pgApiJson, pgUserRoles } from "@/lib/pgIntegration/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ subject: string }> };

/** Role facts for one pairwise subject across enabled organisations. */
export const GET = withApiMonitoring("GET /api/integrations/pg/v1/users/:subject/roles", async (request: Request, routeContext: Context) =>
  handlePgIntegrationRequest(request, async (context) => {
    if (new URL(request.url).searchParams.size > 0) return pgApiError("INVALID_REQUEST", 400);
    const result = await pgUserRoles(context, (await routeContext.params).subject);
    if (result === "not_found") return pgApiError("RESOURCE_NOT_FOUND", 404);
    return pgApiJson(result);
  }),
);
