import { NextResponse } from "next/server";
import { appleAppSiteAssociation } from "@/lib/mobile/appLinks";

export const dynamic = "force-dynamic";

/** iOS Universal Links verification (bundle com.twilighty.yuyu). Served as JSON without a file extension. */
export function GET() {
  return NextResponse.json(appleAppSiteAssociation(), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
