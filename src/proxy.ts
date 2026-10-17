import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isPrivatePath, safeNext } from "./lib/auth/redirect";

/**
 * Next.js 16 proxy (formerly middleware):
 *  1. refreshes the Supabase session cookie on every navigation;
 *  2. sends signed-out visitors of private pages to /login?next=…, and signed-in visitors of
 *     /login to /auth/continue.
 * This is a convenience layer — every page and API route re-checks the reader server-side.
 * In demo mode (no Supabase env) it does nothing.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // getClaims verifies the JWT locally with the project's ES256 signing key (no Auth round trip)
  // and refreshes an expiring session, writing the new cookies onto `response`.
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const withCookies = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  };

  if (!signedIn && isPrivatePath(pathname)) {
    const login = new URL("/login", request.url);
    const next = safeNext(`${pathname}${search}`);
    if (next) login.searchParams.set("next", next);
    return withCookies(login);
  }
  if (signedIn && pathname === "/login") return withCookies(new URL("/auth/continue", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/|auth/callback|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
