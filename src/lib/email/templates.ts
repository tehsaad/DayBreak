/**
 * Transactional email templates. Table-based, inline-styled HTML that renders in common mail
 * clients, plus a plain-text alternative. No tracking pixels.
 */
const INK = "#1b1a17";
const MUTED = "#625d53";
const ACCENT = "#7a1f2b";
const PAPER = "#f7f3ea";
const RULE = "#d9d0bf";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Shared shell. `body` is trusted HTML built from escaped values. */
export function emailShell({ preheader, heading, body, cta, footnote }: { preheader: string; heading: string; body: string; cta: { label: string; href: string }; footnote: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf9f4;border:1px solid ${INK};">
<tr><td align="center" style="padding:28px 32px 12px;font-family:Georgia,'Times New Roman',serif;color:${INK};">
<div style="font-size:30px;font-weight:700;letter-spacing:6px;">DAYBREAK</div>
<div style="font-style:italic;font-size:14px;color:${MUTED};margin-top:4px;">The world, filtered through you.</div>
</td></tr>
<tr><td style="padding:0 32px;"><div style="border-top:2px solid ${INK};border-bottom:1px solid ${INK};height:3px;"></div></td></tr>
<tr><td style="padding:28px 32px 8px;font-family:Georgia,'Times New Roman',serif;color:${INK};">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${ACCENT};margin-bottom:8px;">Your morning paper</div>
<h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;">${escapeHtml(heading)}</h1>
<div style="font-size:16px;line-height:1.6;color:#3d3a34;">${body}</div>
</td></tr>
<tr><td align="left" style="padding:16px 32px 8px;">
<a href="${escapeHtml(cta.href)}" style="display:inline-block;background:${INK};color:${PAPER};font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;padding:13px 22px;">${escapeHtml(cta.label)}</a>
</td></tr>
<tr><td style="padding:20px 32px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid ${RULE};">${footnote}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function welcomeEmail(opts: { name: string | null; appUrl: string }): { subject: string; html: string; text: string } {
  const greeting = opts.name ? `Welcome, ${opts.name}.` : "Welcome to DAYBREAK.";
  const paperUrl = `${opts.appUrl}/newspaper`;
  const html = emailShell({
    preheader: "Your personal morning paper is ready to set up.",
    heading: greeting,
    body: `<p style="margin:0 0 12px;">You've signed in to DAYBREAK with Google. Your account is ready — there's nothing to confirm.</p>
<p style="margin:0 0 12px;">Tell DAYBREAK what you care about and it will print a front page each morning from trusted publishers, with every story linked to its original reporting.</p>`,
    cta: { label: "Open my newspaper", href: paperUrl },
    footnote: `You're receiving this one-time email because a DAYBREAK account was created with this Google address. We won't send it again. If this wasn't you, you can ignore it — no one can sign in without access to your Google account.`,
  });
  const text = `${greeting}

You've signed in to DAYBREAK with Google. Your account is ready — there's nothing to confirm.

Tell DAYBREAK what you care about and it will print a front page each morning from trusted publishers, with every story linked to its original reporting.

Open my newspaper: ${paperUrl}

You're receiving this one-time email because a DAYBREAK account was created with this Google address. We won't send it again.`;
  return { subject: "Welcome to DAYBREAK", html, text };
}

export interface EditionEmailInput {
  readerName: string;
  editionDate: string;
  /** Human-readable date, e.g. "Tuesday 27 October 2026". */
  dateLabel: string;
  editionUrl: string;
  format: "link" | "pdf" | "both";
  contentMode: "live" | "sample";
  stories: { title: string; publisher: string; url: string; section: string }[];
  readingMinutes: number;
}

/**
 * The scheduled edition email: a short table of contents linking to each original article, plus
 * a link to the edition (sign-in required) and/or the attached PDF. Headlines and publisher names
 * only — no AI text, so nothing in the email is unattributed.
 */
export function editionEmail(input: EditionEmailInput): { subject: string; html: string; text: string } {
  const greeting = input.readerName ? `Good morning, ${input.readerName}.` : "Good morning.";
  const top = input.stories.slice(0, 8);
  const items = top
    .map((s) => `<li style="margin:0 0 10px;"><a href="${escapeHtml(s.url)}" style="color:${INK};font-weight:bold;text-decoration:none;">${escapeHtml(s.title)}</a><br><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};">${escapeHtml(s.publisher)} · ${escapeHtml(s.section)}</span></li>`)
    .join("");
  const attached = input.format !== "link";
  const sample = input.contentMode === "sample" ? `<p style="margin:0 0 12px;color:${ACCENT};">This edition was built from DAYBREAK's labelled sample stories because live feeds were unavailable.</p>` : "";
  const html = emailShell({
    preheader: top[0] ? `${top[0].title} — and ${Math.max(0, input.stories.length - 1)} more stories.` : "Your edition is ready.",
    heading: greeting,
    body: `${sample}<p style="margin:0 0 12px;">Your DAYBREAK edition for ${escapeHtml(input.dateLabel)} is ready: ${input.stories.length} stories, about ${input.readingMinutes} minutes of reading (an estimate).${attached ? " The PDF is attached." : ""}</p>
<ol style="margin:0 0 4px;padding-left:20px;font-size:15px;line-height:1.4;">${items}</ol>`,
    cta: { label: "Read today's edition", href: input.editionUrl },
    footnote: `Each headline links to the publisher's original article. Summaries in the edition are written by AI from the publisher's headline and excerpt and are labelled as such. The edition link needs you to be signed in. You receive this because scheduled delivery is on in DAYBREAK Settings → Delivery; turn it off there at any time.`,
  });
  const text = `${greeting}

Your DAYBREAK edition for ${input.dateLabel}: ${input.stories.length} stories, about ${input.readingMinutes} minutes (estimate).${attached ? " The PDF is attached." : ""}

${top.map((s, i) => `${i + 1}. ${s.title} — ${s.publisher}\n   ${s.url}`).join("\n")}

Read today's edition (sign-in required): ${input.editionUrl}

You receive this because scheduled delivery is on in DAYBREAK Settings → Delivery.`;
  return { subject: `Your DAYBREAK — ${input.dateLabel}`, html, text };
}
