/**
 * Minimal server-only Resend client (https://resend.com/docs/api-reference/emails/send-email).
 * RESEND_API_KEY never leaves the server; nothing here is imported by client components.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Resend de-duplicates requests with the same key for 24 hours. */
  idempotencyKey?: string;
  tags?: { name: string; value: string }[];
}

export type SendResult = { ok: true; id: string } | { ok: false; reason: "not_configured" | "rejected" | "network"; status?: number };

export function resendConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendEmail(message: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const cfg = resendConfig();
  if (!cfg) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        "content-type": "application/json",
        ...(message.idempotencyKey ? { "idempotency-key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: cfg.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, tags: message.tags }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, reason: "rejected", status: res.status };
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
