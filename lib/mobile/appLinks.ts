/*
 * App-link association files for the Yuyu mobile apps (Android and iOS).
 * Both are opt-in: without configuration they claim nothing.
 */

export const ANDROID_PACKAGE_NAME = "com.twilighty.yuyu";

function list(raw: string | undefined) {
  return (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

/** Digital Asset Links statement from `ANDROID_APP_SHA256_CERT_FINGERPRINTS`. */
export function assetLinksStatement(rawFingerprints = process.env.ANDROID_APP_SHA256_CERT_FINGERPRINTS) {
  const fingerprints = list(rawFingerprints)
    .map((value) => value.toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  if (fingerprints.length === 0) return [];
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: ANDROID_PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
  }];
}

/** First path segments that are application pages, never organisation slugs or short codes. */
const RESERVED_SEGMENTS = [
  "api", "dashboard", "account", "super-admin", "super-admin-mfa", "embed", "join", "about", "features",
  "privacy", "terms", "discover", "search", "login", "reset-password", "verify-email", "_next", ".well-known",
];

/**
 * Apple App Site Association from `APPLE_APP_IDS` ("TEAMID.bundle.id", comma
 * separated): tickets, event pages, feedback forms and 7-character short codes.
 */
export function appleAppSiteAssociation(rawAppIds = process.env.APPLE_APP_IDS) {
  const appIDs = list(rawAppIds).filter((value) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(value));
  if (appIDs.length === 0) return { applinks: { details: [] } };
  const excluded = RESERVED_SEGMENTS.flatMap((segment) => [
    { "/": `/${segment}`, exclude: true },
    { "/": `/${segment}/*`, exclude: true },
  ]);
  return {
    applinks: {
      details: [{
        appIDs,
        components: [
          ...excluded,
          { "/": "/ticket/*", comment: "Attendee tickets" },
          { "/": "/*/*/feedback", comment: "Event feedback forms" },
          { "/": "/*/*", comment: "Event pages" },
          { "/": "/???????", comment: "Event short links" },
        ],
      }],
    },
  };
}
