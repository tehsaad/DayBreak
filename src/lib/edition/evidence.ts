import { TOPICS, headlineSimilarity, regionName, type TopicId } from "../topics";
import { displayExcerpt } from "../news/rights";
import { truncateText } from "../text";
import type { ArticleSnapshot, BiggerPicture, Edition, EarlierCoverage, EvidenceRef, KnowledgeItem, ReaderPreferences } from "../types";

/**
 * Deterministic, evidence-only analysis. Nothing here is generated prose about the world:
 * every statement is either quoted from a publisher's own description or is a verifiable
 * fact about DAYBREAK's saved editions ("both stories mention X", "carried on 15 Oct").
 */

const ENTITY_STOP = new Set([
  "The", "A", "An", "In", "On", "At", "For", "With", "And", "But", "Or", "As", "By", "From", "To", "Of", "It", "He", "She",
  "They", "We", "This", "That", "These", "Those", "His", "Her", "Their", "Its", "After", "Before", "Over", "New", "How",
  "Why", "What", "When", "Where", "Who", "Mr", "Mrs", "Ms", "Dr", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December", "Today", "Yesterday", "Live", "Watch", "Video", "Photos", "Opinion", "Analysis", "Report",
]);

/** Capitalised names and acronyms that appear mid-sentence ("Imran Khan", "IMF", "World Bank"). */
export function extractEntities(text: string): string[] {
  const found = new Map<string, number>();
  const re = /\b([A-Z][a-z’'\-]+(?:\s+(?:of\s+)?[A-Z][a-z’'\-]+){0,3}|[A-Z]{2,6})\b/g;
  for (const m of text.matchAll(re)) {
    let name = m[1]!.replace(/[’']s$/, "");
    const words = name.split(/\s+/);
    while (words.length && ENTITY_STOP.has(words[0]!)) words.shift();
    name = words.join(" ");
    if (name.length < 2 || ENTITY_STOP.has(name)) continue;
    found.set(name, (found.get(name) ?? 0) + 1);
  }
  return [...found.keys()];
}

/** Names too broad to connect two stories on their own ("AI", "US", "Government"…). */
export const GENERIC_ENTITIES = new Set(
  ["AI", "US", "U.S", "UK", "UN", "EU", "USA", "Government", "Minister", "President", "Prime Minister", "Police", "Court", "Parliament", "State", "City", "World", "Europe", "Asia", "Africa", "America", "China", "India", "Pakistan", "Russia", "Britain", "England", "University", "Company", "Report", "Study", "People", "Report", "BBC", "CEO"].map((e) => e.toLowerCase()),
);

export function specificEntities(text: string): string[] {
  return extractEntities(text).filter((e) => !GENERIC_ENTITIES.has(e.toLowerCase()) && e.length > 2);
}

export function sharedEntities(a: string, b: string): string[] {
  const eb = new Set(extractEntities(b).map((e) => e.toLowerCase()));
  return extractEntities(a).filter((e) => eb.has(e.toLowerCase()));
}

export interface Connection {
  articleId: string;
  title: string;
  relation: string;
  strength: number;
}

/**
 * Stories in the same edition with a genuine link: the same event (very similar headlines), or at
 * least two specific shared names (people, organisations, places below country level). Generic
 * terms such as "AI" or "US" never count. The relation text says plainly that this is a
 * metadata-based connection, not analysis.
 */
export function findConnections(story: ArticleSnapshot, others: ArticleSnapshot[], max = 3): Connection[] {
  const text = `${story.title}. ${story.excerpt}`;
  const mine = new Set(specificEntities(text).map((e) => e.toLowerCase()));
  const out: Connection[] = [];
  for (const o of others) {
    if (o.id === story.id) continue;
    const sim = headlineSimilarity(story.title, o.title);
    const shared = specificEntities(`${o.title}. ${o.excerpt}`).filter((e) => mine.has(e.toLowerCase()));
    const uniqueShared = [...new Map(shared.map((e) => [e.toLowerCase(), e])).values()].slice(0, 3);
    if (sim >= 0.45) {
      out.push({ articleId: o.id, title: o.title, relation: `Basic metadata connection: ${o.publisher} appears to report the same development.`, strength: 3 + sim });
    } else if (uniqueShared.length >= 2) {
      out.push({ articleId: o.id, title: o.title, relation: `Basic metadata connection: both reports involve ${listJoin(uniqueShared)}.`, strength: uniqueShared.length + sim });
    }
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, max);
}

/** Related stories from the reader's own earlier editions. */
export function findEarlierCoverage(story: ArticleSnapshot, history: Edition[], max = 3): EarlierCoverage[] {
  const out: (EarlierCoverage & { s: number })[] = [];
  const text = `${story.title}. ${story.excerpt}`;
  for (const e of history) {
    for (const s of e.stories) {
      if (s.article.id === story.id) continue;
      const sim = headlineSimilarity(story.title, s.article.title);
      const ents = sharedEntities(text, `${s.article.title}. ${s.article.excerpt}`);
      if (sim >= 0.3 || ents.length >= 2) {
        out.push({ editionId: e.id, editionDate: e.editionDate, title: s.article.title, publisher: s.article.publisher, url: s.article.url, s: sim + ents.length * 0.2 });
      }
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.s - a.s || b.editionDate.localeCompare(a.editionDate))
    .filter((x) => (seen.has(x.title) ? false : (seen.add(x.title), true)))
    .slice(0, max)
    .map(({ editionId, editionDate, title, publisher, url }) => ({ editionId, editionDate, title, publisher, url }));
}

/**
 * A question built from the story itself (its headline's own subject and the kind of claim it
 * makes) — not a per-topic template. Used only when no AI analysis is available.
 */
export function storyQuestion(story: Pick<ArticleSnapshot, "title" | "excerpt" | "publisher">): string {
  const t = story.title.replace(/[“”"]/g, "").trim();
  const subject = specificEntities(t)[0] ?? specificEntities(story.excerpt)[0];
  const quoted = t.length > 90 ? `${t.slice(0, 87).replace(/\s+\S*$/, "")}…` : t;
  const lower = `${t} ${story.excerpt}`.toLowerCase();
  if (/\b(study|studies|research|researchers|scientists|trial|survey|finds|found)\b/.test(lower)) {
    return `What does the evidence behind “${quoted}” actually show — how was it measured, and could another explanation account for the result?`;
  }
  if (/\b(says|said|claims?|accus\w*|warns?|alleg\w*|denies|vows?)\b/.test(lower)) {
    return `What evidence ${subject ? `has ${subject}` : "has the speaker"} offered for this, and has anyone independent confirmed or disputed it?`;
  }
  if (/\b(court|judge|ruling|verdict|charged|arrest\w*|trial)\b/.test(lower)) {
    return `What happens next in this case${subject ? ` involving ${subject}` : ""}, and what is still undecided?`;
  }
  if (/\d/.test(t) || /\b(price|inflation|rate|budget|loan|tax|billion|million|percent|%)\b/.test(lower)) {
    return `Who is affected by the figures in “${quoted}”, and compared with what baseline?`;
  }
  if (/\b(plan|policy|bill|law|announce\w*|launch\w*|approv\w*|ban|scheme)\b/.test(lower)) {
    return `${subject ? `When will ${subject}'s` : "When will this"} plan take effect, and who decides whether it works?`;
  }
  return `What would you need to know beyond ${story.publisher}'s report to judge “${quoted}” for yourself?`;
}

function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

export function evidenceRef(a: ArticleSnapshot): EvidenceRef {
  return { articleId: a.id, title: a.title, publisher: a.publisher, url: a.url, publishedAt: a.publishedAt };
}

/** Bigger Picture assembled only from saved evidence. */
export function evidenceBiggerPicture(
  story: ArticleSnapshot,
  editionArticles: ArticleSnapshot[],
  history: Edition[],
  alsoReportedBy: EvidenceRef[] = [],
): BiggerPicture {
  const connections = findConnections(story, editionArticles);
  const earlier = findEarlierCoverage(story, history);
  const whatHappened = displayExcerpt(story.excerpt, story.sourceId) || story.title;
  const insufficient = !story.excerpt || story.excerpt.length < 60;
  let whatChanged: string | null = null;
  if (earlier[0]) {
    whatChanged = `Your edition of ${formatDate(earlier[0].editionDate)} carried related coverage: “${earlier[0].title}” (${earlier[0].publisher}). Compare the two reports to see what has moved on.`;
  }
  return {
    source: "evidence",
    whatHappened,
    whyItMatters: null,
    background: alsoReportedBy.length
      ? `Also reported today by ${listJoin(alsoReportedBy.map((r) => r.publisher))}.`
      : null,
    connections: connections.map(({ articleId, title, relation }) => ({ articleId, title, relation })),
    earlierCoverage: earlier,
    whatChanged,
    watchNext: null,
    question: storyQuestion(story),
    evidence: [evidenceRef(story), ...alsoReportedBy.slice(0, 3)],
    insufficient,
    note: insufficient
      ? "The publisher's feed gives very little detail for this story, so there isn't enough evidence for analysis. Read the original report."
      : "Basic metadata-based view: the publisher's own first sentence, links found from shared names, and your saved editions. No AI analysis was used.",
  };
}

/** Three Things to Remember, assembled from source descriptions (no generated prose). */
export function evidenceThreeThings(stories: { article: ArticleSnapshot; score: number }[], prefs: ReaderPreferences): KnowledgeItem[] {
  const usedTopics = new Set<string>();
  const out: KnowledgeItem[] = [];
  // The lead is already the most prominent thing on the page; remember the rest of the paper first.
  const ranked = [...stories].sort((a, b) => b.score - a.score);
  if (ranked.length > 4) ranked.push(ranked.splice(ranked.findIndex((s) => s === stories[0]), 1)[0]!);
  for (const pass of [true, false]) {
    for (const s of ranked) {
      if (out.length >= 3) break;
      const a = s.article;
      if (out.some((k) => k.articleIds.includes(a.id))) continue;
      const topic = a.topics[0] ?? "world";
      if (pass && (usedTopics.has(topic) || a.excerpt.length < 60)) continue;
      usedTopics.add(topic);
      out.push({
        headline: truncateText(a.title, 110),
        fact: displayExcerpt(a.excerpt, a.sourceId) || a.title,
        interpretation: null,
        regionalNote:
          prefs.region !== "GLOBAL" && a.regions.includes(prefs.region)
            ? `This story concerns ${regionName(prefs.region)}, your selected region.`
            : null,
        articleIds: [a.id],
        source: "evidence",
      });
    }
  }
  return out;
}

export function templateIntro(name: string, lead: ArticleSnapshot | undefined, sectionTitles: string[], count: number): string {
  const greeting = name ? `Good morning, ${name}.` : "Good morning.";
  if (!lead) return `${greeting} There were no stories matching your preferences today.`;
  const sections = sectionTitles.filter((t) => t !== "Front page").slice(0, 4);
  const sectionText = sections.length ? ` across ${listJoin(sections)}` : "";
  return `${greeting} Today's edition leads with ${lead.publisher}'s report, “${truncateText(lead.title, 120)}”. ${count - 1} more ${count - 1 === 1 ? "story follows" : "stories follow"}${sectionText}, each linked to its original reporting.`;
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function topicNoun(topic: TopicId): string {
  return TOPICS[topic].label.toLowerCase();
}
