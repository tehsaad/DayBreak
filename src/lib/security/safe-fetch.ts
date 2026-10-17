import { lookup } from "node:dns/promises";
import { isIP, isPrivateAddress, parseExternalUrl } from "./url";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => {
  const records = await lookup(host, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

let resolver: Resolver = defaultResolver;

/** Test hook: replace DNS resolution. */
export function __setResolverForTests(r: Resolver | null) {
  resolver = r ?? defaultResolver;
}

/** Resolves the host and rejects URLs that point at private or internal networks. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = parseExternalUrl(raw);
  if (!url) throw new UnsafeUrlError("URL is not an allowed external http(s) URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolver(host);
  if (addresses.length === 0) throw new UnsafeUrlError("Host did not resolve");
  for (const address of addresses) {
    if (isPrivateAddress(address)) throw new UnsafeUrlError("Host resolves to a non-public address");
  }
  return url;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Content types accepted (prefix match). Omit to accept anything. */
  accept?: string[];
  fetchImpl?: typeof fetch;
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  body: Buffer;
  finalUrl: string;
}

export const USER_AGENT = "DaybreakReader/1.0 (+https://github.com/tehsaad/DayBreak; personal news digest; links to original reporting)";

/**
 * fetch() with SSRF protection: every hop (including redirects) is resolved and checked,
 * the body is size-capped and the whole request has a hard timeout.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 8000, maxBytes = 3_000_000, maxRedirects = 3, headers = {}, accept, fetchImpl = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const url = await assertPublicUrl(current);
      const res = await fetchImpl(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, ...headers },
      });
      if (res.status >= 300 && res.status < 400 && res.status !== 304) {
        const location = res.headers.get("location");
        if (!location) throw new Error(`Redirect without location (${res.status})`);
        current = new URL(location, url).toString();
        continue;
      }
      if (accept && res.status === 200) {
        const type = (res.headers.get("content-type") ?? "").toLowerCase();
        if (!accept.some((a) => type.startsWith(a))) {
          await res.body?.cancel();
          throw new Error(`Unexpected content type "${type || "none"}"`);
        }
      }
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > maxBytes) {
        await res.body?.cancel();
        throw new Error(`Response too large (${declared} bytes)`);
      }
      const body = await readCapped(res, maxBytes);
      return { status: res.status, headers: res.headers, body, finalUrl: url.toString() };
    }
    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
