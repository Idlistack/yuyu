import { getActiveSigningKey, publishedJwks } from "@/lib/oidc/keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public ID-token verification keys: the active key and recently retired ones. */
export async function GET() {
  try {
    // Make sure a key exists before relying parties first fetch the set.
    await getActiveSigningKey();
    return Response.json(await publishedJwks(), {
      headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    console.error("[oidc] jwks failed");
    return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
