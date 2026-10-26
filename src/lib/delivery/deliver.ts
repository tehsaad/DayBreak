import { formatEditionDate } from "../../components/paper/format";
import { sendThroughTransport, emailTransport, type EmailTransportName } from "../email/transport";
import type { EmailMessage, SendResult } from "../email/resend";
import { editionEmail } from "../email/templates";
import { estimateEditionMinutes } from "../reading-time";
import { safeLinkUrl } from "../security/url";
import type { Store } from "../store/types";
import { topicLabel, isTopicId } from "../topics";
import type { Edition } from "../types";
import { TransientError, withRetry, type RetryPolicy } from "../workflow/errors";
import type { Delivery, DeliveryFormat } from "../workflow/types";

export interface DeliverOptions {
  store: Store;
  edition: Edition;
  runId: string;
  email: string | null;
  format: DeliveryFormat;
  appUrl: string;
  now?: () => Date;
  transport?: EmailTransportName;
  send?: (m: EmailMessage, transport: EmailTransportName) => Promise<SendResult>;
  renderPdf?: (edition: Edition) => Promise<Buffer>;
  retry?: RetryPolicy;
  sleep?: (ms: number) => Promise<void>;
}

export interface DeliverResult {
  delivery: Delivery;
  /** True when an earlier attempt already sent this edition: nothing was sent now. */
  deduplicated: boolean;
  /** Set when the PDF could not be rendered and the email went out with the link only. */
  pdfFallback: string | null;
}

export const deliveryKey = (editionId: string) => `edition:${editionId}:email`;

/**
 * Email one edition to its reader, at most once. The delivery row is keyed by edition and channel
 * and checked before sending; the same key is passed to the provider as its idempotency key, so a
 * retry after a crash between "sent" and "recorded" is also de-duplicated by Resend (24 h window).
 * The edition must already exist: generation always completes before delivery starts.
 */
export async function deliverEdition(opts: DeliverOptions): Promise<DeliverResult> {
  const now = opts.now ?? (() => new Date());
  const transport = opts.transport ?? emailTransport();
  const send = opts.send ?? ((m, t) => sendThroughTransport(m, t));
  const key = deliveryKey(opts.edition.id);
  const existing = await opts.store.getDelivery(opts.edition.userId, key);
  if (existing?.status === "sent") return { delivery: existing, deduplicated: true, pdfFallback: null };

  const base: Delivery = existing ?? {
    key,
    userId: opts.edition.userId,
    editionId: opts.edition.id,
    runId: opts.runId,
    channel: "email",
    format: opts.format,
    status: "pending",
    attempts: 0,
    providerId: null,
    transport,
    error: null,
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
  };
  const finish = async (patch: Partial<Delivery>): Promise<Delivery> => {
    const d = { ...base, runId: opts.runId, format: opts.format, transport, ...patch, updatedAt: now().toISOString() };
    await opts.store.saveDelivery(d);
    return d;
  };

  if (!opts.email) return { delivery: await finish({ status: "skipped", error: "No email address on this account." }), deduplicated: false, pdfFallback: null };
  if (transport === "disabled") return { delivery: await finish({ status: "skipped", error: "Email is not configured on this server (RESEND_API_KEY / RESEND_FROM_EMAIL)." }), deduplicated: false, pdfFallback: null };

  // Claim before sending so the attempt is visible even if the function dies mid-send.
  const attempts = base.attempts + 1;
  await finish({ status: "pending", attempts, error: null });

  let pdfFallback: string | null = null;
  let attachments: EmailMessage["attachments"];
  if (opts.format !== "link") {
    try {
      const render = opts.renderPdf ?? (async (e: Edition) => (await import("../pdf/edition-pdf")).renderEditionPdf(e));
      const pdf = await render(opts.edition);
      attachments = [{ filename: `daybreak-${opts.edition.editionDate}.pdf`, content: pdf.toString("base64") }];
    } catch (err) {
      pdfFallback = `PDF could not be generated (${(err as Error).message?.slice(0, 120)}); sent the link instead.`;
    }
  }

  const { minutes } = estimateEditionMinutes(opts.edition);
  const email = editionEmail({
    readerName: opts.edition.readerName,
    editionDate: opts.edition.editionDate,
    dateLabel: formatEditionDate(opts.edition.editionDate),
    editionUrl: `${opts.appUrl.replace(/\/$/, "")}/newspaper/${opts.edition.id}`,
    format: attachments ? opts.format : "link",
    contentMode: opts.edition.contentMode,
    readingMinutes: minutes,
    stories: opts.edition.stories.flatMap((s) => {
      const url = safeLinkUrl(s.article.url);
      return url ? [{ title: s.article.title, publisher: s.article.publisher, url, section: isTopicId(s.section) ? topicLabel(s.section) : s.section }] : [];
    }),
  });

  try {
    const { value } = await withRetry(
      async () => {
        const r = await send({ to: opts.email!, ...email, idempotencyKey: key, attachments, tags: [{ name: "type", value: "edition" }] }, transport);
        if (r.ok) return r;
        // 429 and 5xx are worth retrying; 4xx (invalid address, unverified sender) are not.
        const retryable = r.reason === "network" || r.status === 429 || (r.status ?? 0) >= 500;
        const message = `Email ${r.reason}${r.status ? ` (HTTP ${r.status})` : ""}${r.message ? `: ${r.message}` : ""}`;
        throw retryable ? new TransientError(message) : Object.assign(new Error(message), { transient: false });
      },
      opts.retry ?? { attempts: 3, baseMs: 1_000, capMs: 8_000 },
      { sleep: opts.sleep },
    );
    return { delivery: await finish({ status: "sent", attempts, providerId: value.ok ? value.id : null, error: pdfFallback }), deduplicated: false, pdfFallback };
  } catch (err) {
    await finish({ status: "failed", attempts, error: (err as Error).message.slice(0, 400) });
    throw err;
  }
}
