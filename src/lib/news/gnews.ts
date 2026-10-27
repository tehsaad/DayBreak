import { z } from "zod";
import type { RawFeedItem } from "./parse";
import type { SourceDef } from "./sources";

/**
 * GNews (https://gnews.io) top-headlines API, used as an extra, key-gated news source.
 *
 * The key is read from the environment at request time, sent only to gnews.io, and redacted
 * from any error text so it never reaches logs or the source-health table. Each article keeps
 * its real publisher (`source.name`) and links to the original story.
 */
export const GNEWS_ENDPOINT = "https://gnews.io/api/v4/top-headlines";

/** Request URL for a GNews source. Includes the key — never log or store the result. */
export function gnewsRequestUrl(source: SourceDef, apiKey: string): string {
  if (!source.gnews) throw new Error(`${source.id} is not a GNews source`);
  const url = new URL(GNEWS_ENDPOINT);
  url.searchParams.set("category", source.gnews.category);
  url.searchParams.set("lang", "en");
  if (source.gnews.country) url.searchParams.set("country", source.gnews.country);
  url.searchParams.set("max", "10");
  url.searchParams.set("apikey", apiKey);
  return url.toString();
}

export const GNEWS_SEARCH_ENDPOINT = "https://gnews.io/api/v4/search";

/** Request URL for a reader's search (GNews /search). Includes the key — never log or store it. */
export function gnewsSearchUrl(query: string, opts: { apiKey: string; from?: Date; max?: number }): string {
  const url = new URL(GNEWS_SEARCH_ENDPOINT);
  // GNews treats quotes and AND/OR/NOT as operators; pass plain words as a phrase-free query.
  url.searchParams.set("q", query.replace(/["()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100));
  url.searchParams.set("lang", "en");
  url.searchParams.set("max", String(opts.max ?? 10));
  url.searchParams.set("sortby", "publishedAt");
  if (opts.from) url.searchParams.set("from", opts.from.toISOString().replace(/\.\d{3}Z$/, "Z"));
  url.searchParams.set("apikey", opts.apiKey);
  return url.toString();
}

const GNewsResponse = z.object({
  totalArticles: z.number().optional(),
  articles: z
    .array(
      z.object({
        title: z.string().nullish(),
        description: z.string().nullish(),
        content: z.string().nullish(),
        url: z.string().nullish(),
        image: z.string().nullish(),
        publishedAt: z.string().nullish(),
        source: z.object({ name: z.string().nullish(), url: z.string().nullish() }).nullish(),
      }),
    )
    .max(100),
});

export class GNewsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GNewsError";
  }
}

/** Convert a GNews JSON response into the same raw items the RSS parser produces. */
export function parseGNews(body: string): RawFeedItem[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new GNewsError("GNews returned invalid JSON");
  }
  const errors = (json as { errors?: unknown })?.errors;
  if (errors) throw new GNewsError(`GNews error: ${String(Array.isArray(errors) ? errors[0] : errors).slice(0, 200)}`);
  const parsed = GNewsResponse.safeParse(json);
  if (!parsed.success) throw new GNewsError("GNews response did not match the expected shape");
  return parsed.data.articles.map((a) => ({
    title: a.title ?? "",
    link: a.url ?? "",
    description: a.description ?? "",
    // `content` is a truncated body; the description is enough and keeps excerpts short.
    content: "",
    published: a.publishedAt ?? null,
    author: null,
    categories: [],
    imageCandidates: a.image ? [{ url: a.image, width: 0 }] : [],
    publisher: a.source?.name?.trim() || undefined,
  }));
}

/** Remove the API key from any text before it is logged or stored. */
export function redactKey(text: string, apiKey: string | undefined): string {
  let out = text.replace(/apikey=[^&\s"']+/gi, "apikey=[redacted]");
  if (apiKey && apiKey.length >= 6) out = out.split(apiKey).join("[redacted]");
  return out;
}
