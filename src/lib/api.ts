import { NextResponse } from "next/server";
import { z } from "zod";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

export function apiError(status: number, error: string, extra?: Record<string, unknown>, headers?: Record<string, string>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "cache-control": "no-store", ...(headers ?? {}) } });
}

/** Parse a JSON body against a schema; returns a 400 response on failure. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > 32_000) return { ok: false, response: apiError(413, "Request body too large") };
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 32_000) return { ok: false, response: apiError(413, "Request body too large") };
    body = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, response: apiError(400, "Body must be valid JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: apiError(400, "Invalid request", { issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or Referer) must match the Host.
 * Cookies are also SameSite=Lax.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Rate limiting: fixed-window counters per key, per server instance. This is an abuse
// brake for expensive endpoints, not a billing guarantee — regeneration additionally has a
// durable cooldown checked against the database.
// ---------------------------------------------------------------------------

const windows = new Map<string, { count: number; resetAt: number }>();

export const RATE_LIMITS = {
  generate: { limit: 6, windowMs: 10 * 60_000 },
  biggerPicture: { limit: 20, windowMs: 10 * 60_000 },
  refresh: { limit: 4, windowMs: 10 * 60_000 },
  pdf: { limit: 30, windowMs: 10 * 60_000 },
  feedback: { limit: 120, windowMs: 60_000 },
  write: { limit: 60, windowMs: 60_000 },
} as const;

export function rateLimit(kind: keyof typeof RATE_LIMITS, key: string, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  const { limit, windowMs } = RATE_LIMITS[kind];
  const k = `${kind}:${key}`;
  const w = windows.get(k);
  if (!w || w.resetAt <= now) {
    windows.set(k, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) for (const [key2, v] of windows) if (v.resetAt <= now) windows.delete(key2);
    return { ok: true };
  }
  if (w.count >= limit) return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  w.count++;
  return { ok: true };
}

export function tooMany(retryAfter: number) {
  return apiError(429, "Too many requests — please slow down.", { retryAfter }, { "retry-after": String(retryAfter) });
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "local";
}

/** Log without user content or secrets. */
export function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
}
