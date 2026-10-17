import { XMLParser } from "fast-xml-parser";

/** A feed item exactly as found in the feed, before normalisation. */
export interface RawFeedItem {
  title: string;
  link: string;
  description: string;
  content: string;
  published: string | null;
  author: string | null;
  categories: string[];
  imageCandidates: { url: string; width: number }[];
  /** Real publisher when the source is an aggregator (GNews). */
  publisher?: string;
}

export interface ParsedFeed {
  format: "rss" | "atom" | "rdf";
  title: string;
  items: RawFeedItem[];
}

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) =>
    ["item", "entry", "category", "link", "media:content", "media:thumbnail", "enclosure", "dc:creator", "author"].includes(name),
});

type Node = Record<string, unknown>;

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") {
    const node = value as Node;
    if ("#text" in node) return text(node["#text"]);
    if ("name" in node) return text(node.name);
    if ("@_term" in node) return text(node["@_term"]);
  }
  return "";
}

function arr(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function attr(node: unknown, name: string): string {
  if (!node || typeof node !== "object") return "";
  const v = (node as Node)[`@_${name}`];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function looksLikeImage(url: string, type: string, medium: string): boolean {
  if (medium === "image" || type.startsWith("image/")) return true;
  if (medium === "video" || type.startsWith("video/") || type.startsWith("audio/")) return false;
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
}

function collectImages(node: Node, html: string): { url: string; width: number }[] {
  const out: { url: string; width: number }[] = [];
  const pushMedia = (m: unknown) => {
    const url = attr(m, "url");
    if (url && looksLikeImage(url, attr(m, "type"), attr(m, "medium"))) out.push({ url, width: Number(attr(m, "width")) || 0 });
  };
  arr(node["media:content"]).forEach(pushMedia);
  const group = node["media:group"] as Node | undefined;
  if (group) arr(group["media:content"]).forEach(pushMedia);
  for (const t of arr(node["media:thumbnail"])) {
    const url = attr(t, "url");
    if (url) out.push({ url, width: Number(attr(t, "width")) || 0 });
  }
  for (const e of arr(node.enclosure)) {
    const url = attr(e, "url");
    if (url && looksLikeImage(url, attr(e, "type"), "")) out.push({ url, width: 0 });
  }
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img?.[1]) out.push({ url: img[1].replace(/&amp;/g, "&").replace(/&#0?38;/g, "&"), width: 0 });
  return out;
}

function atomLink(node: Node): string {
  const links = arr(node.link);
  const alternate = links.find((l) => attr(l, "rel") === "alternate" || !attr(l, "rel"));
  return attr(alternate ?? links[0], "href") || text(links[0]);
}

/** Parse an RSS 2.0, Atom or RSS 1.0 (RDF) document. Never executes or fetches anything. */
export function parseFeed(xml: string): ParsedFeed {
  // Drop any DOCTYPE so internal entity definitions can't be used for entity-expansion attacks.
  const cleaned = xml.replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?>/i, "");
  let doc: Node;
  try {
    doc = parser.parse(cleaned) as Node;
  } catch (err) {
    throw new FeedParseError(`Invalid XML: ${(err as Error).message}`);
  }

  const rss = doc.rss as Node | undefined;
  if (rss?.channel) {
    const channel = (Array.isArray(rss.channel) ? rss.channel[0] : rss.channel) as Node;
    return { format: "rss", title: text(channel.title), items: arr(channel.item).map((i) => rssItem(i as Node)) };
  }
  const feed = doc.feed as Node | undefined;
  if (feed) {
    return { format: "atom", title: text(feed.title), items: arr(feed.entry).map((e) => atomEntry(e as Node)) };
  }
  const rdf = doc["rdf:RDF"] as Node | undefined;
  if (rdf) {
    const channel = rdf.channel as Node | undefined;
    return { format: "rdf", title: text(channel?.title), items: arr(rdf.item).map((i) => rssItem(i as Node)) };
  }
  throw new FeedParseError("Document is not an RSS, Atom or RDF feed");
}

function rssItem(node: Node): RawFeedItem {
  const description = text(node.description);
  const content = text(node["content:encoded"]);
  const authors = [...arr(node["dc:creator"]), ...arr(node.author)].map(text).filter(Boolean);
  return {
    title: text(node.title),
    link: text(node.link) || (attr(node.guid, "isPermaLink") !== "false" ? text(node.guid) : ""),
    description,
    content,
    published: text(node.pubDate) || text(node["dc:date"]) || text(node.published) || null,
    author: authors[0] ?? null,
    categories: arr(node.category).map(text).filter(Boolean),
    imageCandidates: collectImages(node, content || description),
  };
}

function atomEntry(node: Node): RawFeedItem {
  const summary = text(node.summary);
  const content = text(node.content);
  const author = arr(node.author).map(text).filter(Boolean)[0] ?? null;
  return {
    title: text(node.title),
    link: atomLink(node),
    description: summary,
    content,
    published: text(node.published) || text(node.updated) || null,
    author,
    categories: arr(node.category).map((c) => attr(c, "term") || text(c)).filter(Boolean),
    imageCandidates: collectImages(node, content || summary),
  };
}
