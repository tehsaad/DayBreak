import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resendConfig, sendEmail, type EmailMessage, type SendResult } from "../email/resend";
import { welcomeEmail } from "../email/templates";

export function isGoogleUser(user: Pick<User, "app_metadata" | "identities">): boolean {
  return user.app_metadata?.provider === "google" || Boolean(user.identities?.some((i) => i.provider === "google"));
}

export type WelcomeOutcome = "sent" | "not_google" | "not_configured" | "already_sent" | "claim_failed" | "send_failed";

/**
 * Claim the one-time welcome email for this user. Only one caller can win the claim
 * (`welcome_email_sent_at is null` is part of the UPDATE), so retried or concurrent OAuth
 * callbacks never produce a second email. Runs with the reader's own session (RLS).
 */
export async function claimWelcome(supabase: SupabaseClient, user: User): Promise<"claimed" | Exclude<WelcomeOutcome, "sent" | "send_failed">> {
  if (!isGoogleUser(user) || !user.email) return "not_google";
  if (!resendConfig()) return "not_configured";
  const { data, error } = await supabase
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("welcome_email_sent_at", null)
    .select("id");
  if (error) return "claim_failed";
  return data && data.length > 0 ? "claimed" : "already_sent";
}

/** Send the claimed welcome email; on failure release the claim so a later sign-in can retry. */
export async function deliverWelcome(
  supabase: SupabaseClient,
  user: User,
  appUrl: string,
  send: (m: EmailMessage) => Promise<SendResult> = sendEmail,
): Promise<"sent" | "send_failed"> {
  const name = (user.user_metadata?.given_name as string | undefined) ?? (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? null;
  const email = welcomeEmail({ name: name ? name.slice(0, 40) : null, appUrl });
  const result = await send({ to: user.email!, ...email, idempotencyKey: `daybreak-welcome-${user.id}`, tags: [{ name: "type", value: "welcome" }] });
  if (result.ok) return "sent";
  await supabase.from("profiles").update({ welcome_email_sent_at: null }).eq("id", user.id);
  return "send_failed";
}
