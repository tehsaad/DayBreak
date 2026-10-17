/** Returns 4 or 6 for an IP literal, 0 otherwise (pure; usable in client bundles). */
export function isIP(value: string): 0 | 4 | 6 {
  if (/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(value)) return 4;
  if (value.includes(":") && /^[0-9a-f:.]+$/i.test(value)) return 6;
  return 0;
}

/**
 * URL safety helpers. Used for every server-side fetch (feeds, PDF images) and for every URL
 * that is rendered as a link or image, so `javascript:`/`data:` URLs from a feed never reach the page.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Parse and validate an external http(s) URL. Returns null when unusable or dangerous. */
export function parseExternalUrl(raw: string | null | undefined): URL | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (isIP(host.replace(/^\[|\]$/g, "")) && isPrivateAddress(host.replace(/^\[|\]$/g, ""))) return null;
  if (!host.includes(".") && !isIP(host)) return null;
  return url;
}

/** A link that is safe to render in an <a href>, or null. */
export function safeLinkUrl(raw: string | null | undefined): string | null {
  return parseExternalUrl(raw)?.toString() ?? null;
}

/** An image URL that is safe to render. Only https, to avoid mixed content. */
export function safeImageUrl(raw: string | null | undefined): string | null {
  const url = parseExternalUrl(raw);
  if (!url) return null;
  if (url.protocol !== "https:") {
    // Many feeds still publish http image links that are also served over https.
    url.protocol = "https:";
  }
  return url.toString();
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, bits]) => inCidr4(ip, base as string, bits as number));
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    if (/^f[cd]/.test(lower)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
    if (/^ff/.test(lower)) return true; // multicast
    if (lower.startsWith("64:ff9b:")) return true; // NAT64 can reach internal v4
    return false;
  }
  return true;
}

