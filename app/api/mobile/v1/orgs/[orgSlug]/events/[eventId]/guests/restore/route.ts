import { z } from "zod";
import { restoreRsvpForUser } from "@/lib/core/rsvpAdmin";
import { eventRoute } from "@/lib/mobile/eventRoute";
import { mobileActionError, mobileOk, parseJsonBody } from "@/lib/mobile/http";

const bodySchema = z.object({ undoId: z.string().min(1).max(128) }).strict();

export const POST = eventRoute("POST /api/mobile/v1/orgs/:orgSlug/events/:eventId/guests/restore", null, async (request, _params, { auth, event }) => {
  const body = await parseJsonBody(request, bodySchema);
  if ("response" in body) return body.response;
  const result = await restoreRsvpForUser(auth.userId, { organisationSlug: event.organisation.slug, undoId: body.data.undoId });
  if (!result.ok) return mobileActionError(result);
  return mobileOk(null);
});
