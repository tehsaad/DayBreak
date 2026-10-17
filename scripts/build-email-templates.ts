/**
 * Writes the Supabase Auth email templates (Go templates) from DAYBREAK's email shell.
 * Paste each file into Supabase → Authentication → Emails → Templates. Usage: npx tsx scripts/build-email-templates.ts
 */
import { writeFileSync } from "node:fs";
import { emailShell } from "../src/lib/email/templates";

// token_hash links are verified server-side by /auth/callback (works across browsers, unlike PKCE codes).
const CONFIRM = "{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email";

const fallback = (what: string) =>
  `If the button doesn't work, copy this link into your browser:<br><a href="${CONFIRM}" style="color:#7a1f2b;word-break:break-all;">${CONFIRM}</a><br><br>${what}`;

writeFileSync(
  "supabase/templates/confirm-signup.html",
  emailShell({
    preheader: "Confirm your email to finish creating your DAYBREAK account.",
    heading: "Confirm your email",
    body: `<p style="margin:0 0 12px;">Someone — hopefully you — asked to create a DAYBREAK account with <strong>{{ .Email }}</strong>.</p>
<p style="margin:0 0 12px;">Confirm your address to finish signing up. You'll go straight to setting up your morning paper.</p>`,
    cta: { label: "Confirm your email", href: CONFIRM },
    footnote: fallback("This link expires after a short time and can be used once. If you didn't create an account, ignore this email — nothing will happen."),
  }) + "\n",
);

writeFileSync(
  "supabase/templates/magic-link.html",
  emailShell({
    preheader: "Your one-time link to sign in to DAYBREAK.",
    heading: "Your sign-in link",
    body: `<p style="margin:0 0 12px;">Use this one-time link to sign in to DAYBREAK as <strong>{{ .Email }}</strong>.</p>`,
    cta: { label: "Sign in to DAYBREAK", href: CONFIRM },
    footnote: fallback("The link expires shortly and works once. If you didn't ask to sign in, you can ignore this email."),
  }) + "\n",
);
console.log("wrote supabase/templates/confirm-signup.html and magic-link.html");
