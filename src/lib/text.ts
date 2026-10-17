/** Text helpers for untrusted feed content. Output is plain text; React escapes it on render. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", bull: "•",
  copy: "©", reg: "®", trade: "™", deg: "°", eacute: "é", egrave: "è", aacute: "á", oacute: "ó",
  uacute: "ú", iacute: "í", ntilde: "ñ", uuml: "ü", ouml: "ö", auml: "ä", ccedil: "ç", pound: "£",
  euro: "€", times: "×", shy: "",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Strip markup and normalise whitespace. Handles double-encoded HTML that some feeds send. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  // Decode once first in case the HTML itself is entity-encoded (&lt;p&gt;).
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|iframe|noscript|svg|figure|figcaption)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  s = decodeEntities(s);
  return cleanText(s);
}

/** Remove control characters, soft hyphens and zero-width characters; collapse whitespace. */
export function cleanText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip boilerplate tails such as "Continue reading..." and "The post X appeared first on Y". */
export function stripFeedBoilerplate(input: string): string {
  return input
    .replace(/^[A-Z][\w &]{1,40}, Published online: [^;]{4,40}; doi:\S+\s*/, "")
    .replace(/\s*Continue reading\.*\s*$/i, "")
    .replace(/\s*The post .{0,300} (appeared first|first appeared) on .{0,120}\.?\s*$/i, "")
    .replace(/\s*\[(…|\.\.\.|&#8230;)\]\s*$/u, "…")
    .replace(/\s*Read more\.*\s*$/i, "")
    .trim();
}

/**
 * Split into sentences (good enough for news prose). Only breaks at terminal punctuation that is
 * followed by whitespace and a capital letter, digit or opening quote — so "0.04", "U.S." and
 * "Mr. Khan" stay intact.
 */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…]["”’)]?)\s+(?=[A-Z0-9“"‘(•])/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .reduce<string[]>((out, p) => {
      // Re-join splits after common abbreviations.
      const prev = out[out.length - 1];
      if (prev && /(\b(Mr|Mrs|Ms|Dr|St|No|Gen|Lt|Col|Sen|Rep|Prof|Jr|Sr|vs)\.|\b[A-Z]\.)$/.test(prev)) out[out.length - 1] = `${prev} ${p}`;
      else out.push(p);
      return out;
    }, []);
}

/**
 * Truncate at a sentence boundary when possible, otherwise at a word boundary, adding an ellipsis.
 */
export function truncateText(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  const parts = sentences(clean);
  let out = "";
  for (const p of parts) {
    if ((out + " " + p).trim().length > maxChars) break;
    out = (out + " " + p).trim();
  }
  if (out.length >= maxChars * 0.5) return out;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–—-]+$/, "") + "…";
}

export function firstSentence(text: string, maxChars = 240): string {
  const s = sentences(text)[0] ?? text;
  return truncateText(s, maxChars);
}

/** Numbers (as digit strings) mentioned in a text — used to check that summaries don't invent figures. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ""));
}
