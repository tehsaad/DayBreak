import type { ReaderPreferences } from "../types";

/** Short-lived cookie holding where to go after signing in (kept out of OAuth redirect URLs). */
export const NEXT_COOKIE = "daybreak_next";

/** The address a confirmation email was sent to, so the resend form can be prefilled (httpOnly, 1 hour). */
export const PENDING_EMAIL_COOKIE = "daybreak_pending_email";

/** Where an authenticated reader belongs: onboarding until it is complete, then the newspaper. */
export function destinationFor(prefs: ReaderPreferences | null): "/onboarding" | "/newspaper" {
  return prefs?.onboardedAt ? "/newspaper" : "/onboarding";
}

/** A same-site relative path, or null. Rejects protocol-relative and backslash tricks. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 300) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (/^\/(auth|api)\//.test(raw)) return null;
  try {
    const u = new URL(raw, "https://daybreak.invalid");
    if (u.origin !== "https://daybreak.invalid") return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

/** Paths that need a signed-in reader (checked in proxy.ts and again on the server). */
export const PRIVATE_PREFIXES = ["/newspaper", "/archive", "/saved", "/explore", "/search", "/settings", "/onboarding"];

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const AUTH_ERRORS: Record<string, string> = {
  credentials: "That email and password don't match an account.",
  unconfirmed: "Please confirm your email address first — check your inbox for the link.",
  cancelled: "Sign-in was cancelled. You can try again whenever you're ready.",
  expired: "That sign-in link has expired or was already used. Request a new one.",
  provider: "The sign-in provider returned an error. Please try again.",
  oauth: "Google sign-in isn't available right now. Use email instead, or try again later.",
  weak_password: "Choose a password of at least 8 characters.",
  invalid_email: "Enter a valid email address.",
  exists: "An account with that email already exists — sign in instead.",
  rate_limited: "Too many attempts. Please wait a minute and try again.",
  resend_cooldown: "A confirmation email was sent moments ago. Please wait a minute before asking for another.",
  not_configured: "Accounts aren't configured on this deployment.",
  unknown: "Something went wrong signing you in. Please try again.",
};

export const AUTH_NOTICES: Record<string, string> = {
  check_email: "Check your inbox: we've sent a link to confirm your email address.",
  confirmation_resent: "We've sent a new confirmation link. Check your inbox (and spam folder).",
  magic_link_sent: "Check your inbox: we've sent you a one-time sign-in link.",
  signed_out: "You've been signed out.",
};

/** Map a Supabase auth error to one of our short error codes (never echo raw provider text). */
export function authErrorCode(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!error) return "unknown";
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "credentials";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "unconfirmed";
  if (code === "weak_password" || msg.includes("password should be")) return "weak_password";
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) return "exists";
  if (code === "email_address_invalid" || msg.includes("invalid format") || (msg.includes("email address") && msg.includes("invalid"))) return "invalid_email";
  if (error.status === 429 || code.includes("rate_limit") || msg.includes("rate limit")) return "rate_limited";
  if (code.includes("otp_expired") || code === "flow_state_expired" || code === "bad_code_verifier" || msg.includes("expired") || msg.includes("invalid flow state")) return "expired";
  return "unknown";
}
