"use client";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly data: Record<string, unknown> = {}) {
    super(message);
  }
}

/** JSON fetch for our own API routes, with readable errors. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      keepalive: init.keepalive,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(navigator.onLine ? "Network error — please try again." : "You're offline.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(typeof data.error === "string" ? data.error : `Request failed (${res.status})`, res.status, data);
  return data as T;
}
