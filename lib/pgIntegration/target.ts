import net from "node:net";
import {
  isBlockedWebhookAddress,
  lookupWebhookHost,
  parseIpv6,
  parseWebhookUrl,
  webhookPrivateTargetsAllowed,
  WebhookTargetBlockedError,
  type ResolvedAddress,
} from "@/lib/webhooks/urlSafety";

/*
 * Target rules for the People's Gallery integration endpoint
 * (docs/PG_INTEGRATION.md#target-rules). The URL is set by the instance
 * operator, not a tenant. By default it follows the organisation-webhook SSRF
 * rules (public https only). With the integration's explicit
 * `allowInternalTarget` setting, an in-cluster receiver is allowed: http or
 * https, any port, private (RFC 1918, CGNAT, ULA) addresses and cluster DNS
 * names. Even then loopback, link-local (including the 169.254.169.254
 * metadata service), unspecified, multicast and reserved addresses stay
 * blocked; loopback only opens with the development/test switch
 * WEBHOOKS_ALLOW_PRIVATE_TARGETS, which production ignores. The delivery
 * connects only to the addresses vetted here (pinned lookup).
 */

function ipv4Octets(address: string) {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

/** Addresses an internal integration target may never reach. */
export function isForbiddenInternalAddress(address: string, allowLoopback = false): boolean {
  const bare = address.trim().replace(/^\[|\]$/g, "").split("%")[0]!;
  const family = net.isIP(bare);
  if (family === 4) {
    const [a, b] = ipv4Octets(bare)!;
    if (a === 127) return !allowLoopback;
    return a === 0 || (a === 169 && b === 254) || a! >= 224;
  }
  if (family === 6) {
    const g = parseIpv6(bare);
    if (!g) return true;
    const head = g.slice(0, 5).every((group) => group === 0);
    if (head && g[5] === 0xffff) return isForbiddenInternalAddress(`${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`, allowLoopback);
    if (head && g[5] === 0 && g[6] === 0 && g[7] === 1) return !allowLoopback; // ::1
    if (g.every((group) => group === 0)) return true; // ::
    if ((g[0]! & 0xffc0) === 0xfe80) return true; // link-local
    if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
    return false;
  }
  return true;
}

export type IntegrationTargetPolicy = { allowInternalTarget: boolean };

export type ParsedIntegrationUrl = { ok: true; url: string } | { ok: false; error: string };

/** Validates the endpoint URL without the network (used when it is saved and before each delivery). */
export function parseIntegrationUrl(raw: string, policy: IntegrationTargetPolicy): ParsedIntegrationUrl {
  if (!policy.allowInternalTarget) {
    const parsed = parseWebhookUrl(raw, { allowPrivate: webhookPrivateTargetsAllowed() });
    return parsed.ok ? { ok: true, url: parsed.url } : parsed;
  }
  const value = raw.trim();
  if (!value || value.length > 2048) return { ok: false, error: "Enter an endpoint URL of up to 2,048 characters." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Enter a valid http:// or https:// URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Use http:// or https://." };
  if (url.username || url.password) return { ok: false, error: "Remove the user name or password from the URL; requests are signed instead." };
  url.hash = "";
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return { ok: false, error: "Enter a valid http:// or https:// URL." };
  if (net.isIP(host) && isForbiddenInternalAddress(host, webhookPrivateTargetsAllowed())) {
    return { ok: false, error: "This address is loopback, link-local, multicast or reserved." };
  }
  return { ok: true, url: url.href };
}

/** Resolve and vet the endpoint for one delivery; throws WebhookTargetBlockedError when refused. */
export async function resolveIntegrationTarget(rawUrl: string, policy: IntegrationTargetPolicy): Promise<ResolvedAddress[]> {
  const parsed = parseIntegrationUrl(rawUrl, policy);
  if (!parsed.ok) throw new WebhookTargetBlockedError(parsed.error);
  const host = new URL(parsed.url).hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const literal = net.isIP(host);
  const addresses: ResolvedAddress[] = literal ? [{ address: host, family: literal === 6 ? 6 : 4 }] : await lookupWebhookHost(host);
  if (addresses.length === 0) {
    const error = new Error("The integration host did not resolve.") as Error & { code: string };
    error.code = "ENOTFOUND";
    throw error;
  }
  const allowPrivate = webhookPrivateTargetsAllowed();
  const blocked = policy.allowInternalTarget
    ? addresses.some((entry) => isForbiddenInternalAddress(entry.address, allowPrivate))
    : !allowPrivate && addresses.some((entry) => isBlockedWebhookAddress(entry.address));
  if (blocked) throw new WebhookTargetBlockedError();
  return addresses;
}
