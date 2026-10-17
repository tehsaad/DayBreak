import { TOPICS, contentTokens, headlineSimilarity, regionName, type TopicId } from "../topics";
import { firstSentence, truncateText } from "../text";
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

/** Stories in the same edition that share named entities or substantial vocabulary. */
export function findConnections(story: ArticleSnapshot, others: ArticleSnapshot[], max = 3): Connection[] {
  const text = `${story.title}. ${story.excerpt}`;
  const tokens = contentTokens(text);
  const out: Connection[] = [];
  for (const o of others) {
    if (o.id === story.id) continue;
    const otherText = `${o.title}. ${o.excerpt}`;
    const entities = sharedEntities(text, otherText).slice(0, 3);
    const otherTokens = contentTokens(otherText);
    let shared = 0;
    for (const t of tokens) if (otherTokens.has(t)) shared++;
    const strength = entities.length * 2 + shared / Math.max(6, Math.min(tokens.size, otherTokens.size));
    if (entities.length >= 1 && (entities.length >= 2 || shared >= 4)) {
      out.push({ articleId: o.id, title: o.title, relation: `Both stories mention ${listJoin(entities)}.`, strength });
    } else if (headlineSimilarity(story.title, o.title) >= 0.3) {
      out.push({ articleId: o.id, title: o.title, relation: "Closely related headline in today's edition.", strength });
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

const QUESTIONS: Record<TopicId, string> = {
  "ai-tech": "Who benefits from this technology, and who carries its risks?",
  science: "How large was the study, and has the result been independently replicated?",
  pakistan: "Which institutions are involved, and what do official sources versus other parties say?",
  world: "Whose accounts does this report rely on, and which perspectives are missing?",
  education: "Who is eligible or affected, and what are the deadlines or costs involved?",
  business: "Who gains and who pays — consumers, workers, investors or the state?",
  climate: "Is this a single event or part of a measured long-term trend?",
  health: "What does the evidence show, and how strong is it — trial, observation or expert opinion?",
  sports: "What does this result change in the standings or the season ahead?",
  culture: "Why is this work drawing attention now, and from whom?",
  society: "Whose lives does this change, and are their voices in the reporting?",
};

export function criticalQuestion(topic: TopicId | undefined): string {
  return QUESTIONS[topic ?? "world"];
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
  const whatHappened = story.excerpt ? firstSentence(story.excerpt, 320) : story.title;
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
    question: criticalQuestion(story.topics[0]),
    evidence: [evidenceRef(story), ...alsoReportedBy.slice(0, 3)],
    insufficient,
    note: insufficient
      ? "The publisher's feed gives very little detail for this story, so there isn't enough evidence for analysis. Read the original report."
      : "Assembled from the publisher's description and your saved editions. AI analysis is not available for this story.",
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
        fact: a.excerpt ? firstSentence(a.excerpt, 260) : a.title,
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
