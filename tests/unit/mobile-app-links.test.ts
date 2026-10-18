import { describe, expect, it } from "vitest";
import { appleAppSiteAssociation, assetLinksStatement } from "@/lib/mobile/appLinks";

const fingerprint = Array.from({ length: 32 }, () => "AB").join(":");

describe("mobile app-link association files", () => {
  it("returns an empty assetlinks statement unless fingerprints are configured", () => {
    expect(assetLinksStatement(undefined)).toEqual([]);
    expect(assetLinksStatement("not-a-fingerprint")).toEqual([]);
    expect(assetLinksStatement(` ${fingerprint.toLowerCase()} `)).toEqual([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.twilighty.yuyu", sha256_cert_fingerprints: [fingerprint] },
    }]);
  });

  it("returns empty applinks unless app ids are configured", () => {
    expect(appleAppSiteAssociation(undefined)).toEqual({ applinks: { details: [] } });
    expect(appleAppSiteAssociation("bad id")).toEqual({ applinks: { details: [] } });
    const aasa = appleAppSiteAssociation("ABCDE12345.com.twilighty.yuyu");
    const detail = aasa.applinks.details[0]!;
    expect(detail.appIDs).toEqual(["ABCDE12345.com.twilighty.yuyu"]);
    const paths = detail.components.map((component) => component["/"]);
    expect(paths).toEqual(expect.arrayContaining(["/ticket/*", "/*/*/feedback", "/*/*", "/???????"]));
    // Application areas are excluded before the broad event-page patterns.
    const firstInclude = detail.components.findIndex((component) => !("exclude" in component));
    expect(detail.components.slice(0, firstInclude).map((component) => component["/"])).toEqual(expect.arrayContaining(["/api/*", "/dashboard/*", "/account", "/account/*"]));
  });
});
