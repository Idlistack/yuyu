import { eventRoute } from "@/lib/mobile/eventRoute";
import { mobileOk } from "@/lib/mobile/http";
import { loadOrganiserSchedule } from "@/lib/mobile/organiser";

export const GET = eventRoute("GET /api/mobile/v1/orgs/:orgSlug/events/:eventId/schedule", (permissions) => permissions.schedule, async (_request, _params, { event }) =>
  mobileOk(await loadOrganiserSchedule(event)));
