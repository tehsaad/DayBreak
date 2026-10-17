import { randomUUID } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { storageMode, supabaseConfig } from "../env";
import { getFileStore } from "../store";
import type { Store } from "../store/types";

export const DEMO_COOKIE = "daybreak_demo";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReaderContext {
  mode: "supabase" | "demo";
  userId: string;
  email: string | null;
  store: Store;
}

/** Supabase client bound to the current request's auth cookies. */
export async function supabaseForRequest() {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Supabase is not configured");
  const jar = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only; proxy.ts refreshes sessions.
        }
      },
    },
  });
}

/**
 * The current reader, or null if there is none yet.
 * - Supabase mode: the signed-in user. `getClaims()` verifies the session JWT's signature
 *   against the project's published signing keys (ES256) — locally, without an Auth-server
 *   round trip — and refreshes the session first if it is about to expire. A user id supplied by
 *   the browser is never trusted.
 * - Demo mode: an anonymous id stored in an httpOnly cookie; data stays on this server.
 *
 * Wrapped in React `cache()` so the header and the page share one lookup per request.
 */
export const getReader = cache(async (): Promise<ReaderContext | null> => {
  if (storageMode() === "supabase") {
    const supabase = await supabaseForRequest();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub || claims.role !== "authenticated") return null;
    const { createReaderStore } = await import("../store/supabase-store");
    return { mode: "supabase", userId: claims.sub, email: typeof claims.email === "string" ? claims.email : null, store: createReaderStore(supabase, getFileStore()) };
  }
  const jar = await cookies();
  const id = jar.get(DEMO_COOKIE)?.value;
  if (!id || !UUID_RE.test(id)) return null;
  return { mode: "demo", userId: id, email: null, store: getFileStore() };
});

/**
 * Like getReader, but in demo mode creates the anonymous reader if needed.
 * Only call from Route Handlers / Server Actions (it may set a cookie).
 */
export async function getOrCreateReader(): Promise<ReaderContext | null> {
  const existing = await getReader();
  if (existing || storageMode() === "supabase") return existing;
  const id = randomUUID();
  const jar = await cookies();
  jar.set(DEMO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return { mode: "demo", userId: id, email: null, store: getFileStore() };
}
