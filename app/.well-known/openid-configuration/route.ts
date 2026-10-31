import { discoveryDocument } from "@/lib/oidc/discovery";

export const dynamic = "force-dynamic";

/** OpenID Provider configuration (docs/OIDC_PROVIDER.md). The issuer comes from configuration only. */
export function GET() {
  return Response.json(discoveryDocument(), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" },
  });
}
