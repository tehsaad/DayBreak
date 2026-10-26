import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../env";
import { resendConfig, sendEmail, type EmailMessage, type SendResult } from "./resend";

/**
 * Where outgoing reader email goes.
 * - "resend": the real provider (needs RESEND_API_KEY and RESEND_FROM_EMAIL).
 * - "file":   a local outbox (DATA_DIR/outbox/*.html + .json) — nothing leaves the machine.
 * - "log":    one structured log line per message, no content.
 * - "disabled": delivery is reported as skipped.
 * Default: "resend" in production when configured; "file" outside production, so local runs and
 * tests can never email a real person by accident.
 */
export type EmailTransportName = "resend" | "file" | "log" | "disabled";

export function emailTransport(): EmailTransportName {
  const requested = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (requested === "resend" || requested === "file" || requested === "log" || requested === "disabled") {
    return requested === "resend" && !resendConfig() ? "disabled" : requested;
  }
  if (process.env.NODE_ENV === "production") return resendConfig() ? "resend" : "disabled";
  return "file";
}

export async function sendThroughTransport(message: EmailMessage, transport: EmailTransportName = emailTransport(), fetchImpl?: typeof fetch): Promise<SendResult> {
  switch (transport) {
    case "resend":
      return sendEmail(message, fetchImpl);
    case "file": {
      const dir = path.resolve(dataDir(), "outbox");
      await mkdir(dir, { recursive: true });
      const id = `outbox-${(message.idempotencyKey ?? String(Date.now())).replace(/[^a-z0-9-]/gi, "_")}`;
      await writeFile(path.join(dir, `${id}.html`), message.html);
      await writeFile(
        path.join(dir, `${id}.json`),
        JSON.stringify({ to: message.to, subject: message.subject, text: message.text, tags: message.tags, attachments: message.attachments?.map((a) => ({ filename: a.filename, bytes: Buffer.from(a.content, "base64").length })) }, null, 2),
      );
      if (message.attachments) for (const a of message.attachments) await writeFile(path.join(dir, `${id}-${a.filename}`), Buffer.from(a.content, "base64"));
      return { ok: true, id };
    }
    case "log":
      console.log(JSON.stringify({ at: new Date().toISOString(), event: "email_logged", subject: message.subject, attachments: message.attachments?.length ?? 0 }));
      return { ok: true, id: `log-${Date.now()}` };
    case "disabled":
      return { ok: false, reason: "not_configured" };
  }
}
