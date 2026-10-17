/**
 * Topic taxonomy, fine-grained interests and the deterministic topic/region classifier.
 *
 * Topics are the paper's sections. Interests are narrower subjects inside a topic;
 * each carries keywords so a ranking reason like "Matches your interest in AI research"
 * is backed by a real keyword hit, not invented.
 */

export const TOPIC_IDS = [
  "ai-tech",
  "science",
  "pakistan",
  "world",
  "education",
  "business",
  "climate",
  "health",
  "sports",
  "culture",
  "society",
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export interface TopicDef {
  id: TopicId;
  label: string;
  short: string;
  blurb: string;
  /** Lower-case keywords or phrases. Matched on word boundaries. */
  keywords: string[];
}

export const TOPICS: Record<TopicId, TopicDef> = {
  "ai-tech": {
    id: "ai-tech",
    label: "AI & Technology",
    short: "Technology",
    blurb: "Artificial intelligence, software, platforms and the people building them.",
    keywords: [
      "artificial intelligence", "ai", "machine learning", "chatbot", "openai", "anthropic", "deepmind",
      "llm", "algorithm", "software", "app", "apps", "smartphone", "iphone", "android", "google", "apple",
      "microsoft", "meta", "nvidia", "chip", "chips", "semiconductor", "cyber", "hack", "hacker", "hacked",
      "data breach", "tech", "technology", "startup", "robot", "robotics", "quantum computing", "internet",
      "social media", "tiktok", "x.com", "elon musk", "tesla", "computer", "digital", "online", "5g",
    ],
  },
  science: {
    id: "science",
    label: "Science & Research",
    short: "Science",
    blurb: "Discoveries, space, research findings and how we know what we know.",
    keywords: [
      "science", "scientist", "scientists", "research", "researchers", "study", "studies", "discovery",
      "nasa", "space", "spacex", "rocket", "moon", "mars", "planet", "telescope", "astronomer", "physics",
      "chemistry", "biology", "genome", "dna", "fossil", "species", "evolution", "journal", "nature",
      "experiment", "laboratory", "particle", "asteroid", "galaxy", "neuroscience",
    ],
  },
  pakistan: {
    id: "pakistan",
    label: "Pakistan",
    short: "Pakistan",
    blurb: "Politics, policy and life across Pakistan.",
    keywords: [
      "pakistan", "pakistani", "islamabad", "karachi", "lahore", "peshawar", "quetta", "rawalpindi",
      "multan", "faisalabad", "punjab", "sindh", "balochistan", "khyber pakhtunkhwa", "k-p", "kp",
      "gilgit", "pti", "pml-n", "ppp", "imran khan", "shehbaz", "nawaz sharif", "zardari", "bilawal",
      "maryam nawaz", "senate of pakistan", "national assembly", "ISI", "sbp", "pkr", "rupee",
    ],
  },
  world: {
    id: "world",
    label: "World Affairs",
    short: "World",
    blurb: "Diplomacy, conflict and the international order.",
    keywords: [
      "united nations", "un", "diplomat", "diplomacy", "foreign minister", "summit", "war", "ceasefire",
      "troops", "military", "nato", "sanctions", "election", "president", "prime minister", "parliament",
      "ukraine", "ukrainian", "russia", "russian", "kremlin", "china", "chinese", "beijing", "india", "iran", "iranian", "tehran", "israel", "israeli", "palestinian", "west bank", "gaza", "hamas", "hezbollah", "lebanon", "syria", "yemen", "sudan", "afghanistan", "taliban", "europe",
      "eu", "us", "white house", "refugees", "border", "treaty", "conflict", "protest", "protests",
    ],
  },
  education: {
    id: "education",
    label: "Education & Scholarships",
    short: "Education",
    blurb: "Schools, universities, exams, scholarships and the future of learning.",
    keywords: [
      "education", "school", "schools", "university", "universities", "college", "student", "students",
      "teacher", "teachers", "exam", "exams", "scholarship", "scholarships", "fellowship", "admissions",
      "curriculum", "HEC", "degree", "campus", "pupils", "tuition", "literacy", "academic", "phd",
      "fulbright", "chevening", "erasmus", "o level", "a level", "matric", "learning",
    ],
  },
  business: {
    id: "business",
    label: "Business & Economy",
    short: "Business",
    blurb: "Markets, companies, startups and the economy in your pocket.",
    keywords: [
      "economy", "economic", "economist", "inflation", "interest rate", "interest rates", "central bank",
      "imf", "world bank", "gdp", "budget", "tax", "taxes", "tariff", "tariffs", "trade", "exports",
      "imports", "market", "markets", "stocks", "shares", "investors", "investment", "bank", "banks",
      "company", "companies", "profit", "revenue", "startup", "startups", "funding", "venture capital",
      "billion", "oil price", "jobs", "unemployment", "wages", "psx", "stock exchange", "business",
    ],
  },
  climate: {
    id: "climate",
    label: "Climate & Environment",
    short: "Climate",
    blurb: "Climate change, energy, weather extremes and the natural world.",
    keywords: [
      "climate", "climate change", "global warming", "emissions", "carbon", "net zero", "COP", "renewable",
      "renewables", "solar", "wind power", "fossil fuel", "fossil fuels", "coal", "flood", "floods",
      "flooding", "drought", "heatwave", "heat wave", "wildfire", "wildfires", "glacier", "glaciers",
      "pollution", "smog", "air quality", "environment", "environmental", "biodiversity", "deforestation",
      "monsoon", "cyclone", "hurricane", "storm", "sea level", "wildlife",
    ],
  },
  health: {
    id: "health",
    label: "Health & Wellbeing",
    short: "Health",
    blurb: "Medicine, public health, care systems and everyday wellbeing.",
    keywords: [
      "health", "hospital", "hospitals", "doctor", "doctors", "nurse", "nurses", "patients", "disease",
      "virus", "vaccine", "vaccines", "vaccination", "polio", "dengue", "malaria", "cancer", "diabetes",
      "mental health", "WHO", "NHS", "medicine", "medical", "drug", "drugs", "treatment", "outbreak",
      "pandemic", "covid", "obesity", "wellbeing", "nutrition", "surgery",
    ],
  },
  sports: {
    id: "sports",
    label: "Sport",
    short: "Sport",
    blurb: "Cricket, football and the rest of the game.",
    keywords: [
      "cricket", "football", "soccer", "tennis", "hockey", "olympics", "olympic", "match", "tournament",
      "world cup", "league", "premier league", "champions league", "psl", "pcb", "icc", "test match",
      "odi", "t20", "wicket", "batter", "bowler", "goal", "coach", "fifa", "squash", "athletics",
      "formula 1", "f1", "grand prix", "final", "semi-final", "championship", "squad", "captain",
    ],
  },
  culture: {
    id: "culture",
    label: "Culture & Entertainment",
    short: "Culture",
    blurb: "Film, books, music, art and the ideas they carry.",
    keywords: [
      "film", "films", "movie", "movies", "cinema", "actor", "actress", "director", "netflix", "series",
      "television", "tv", "music", "album", "singer", "song", "concert", "book", "books", "novel",
      "author", "literature", "art", "artist", "museum", "exhibition", "festival", "theatre", "drama",
      "oscar", "oscars", "award", "awards", "celebrity", "fashion", "coke studio",
    ],
  },
  society: {
    id: "society",
    label: "Society & Development",
    short: "Society",
    blurb: "Rights, communities, poverty, gender and how societies change.",
    keywords: [
      "society", "social", "poverty", "inequality", "human rights", "rights", "women", "gender", "girls",
      "children", "child", "migrants", "migration", "housing", "welfare", "charity", "development",
      "community", "communities", "minority", "minorities", "religion", "justice", "court", "police",
      "crime", "aid", "humanitarian", "displacement", "disability", "labour", "workers",
    ],
  },
};

export interface InterestDef {
  id: string;
  topic: TopicId;
  label: string;
  keywords: string[];
}

/** Fine-grained interests. Selecting one also implies following its topic. */
export const INTERESTS: InterestDef[] = [
  { id: "ai-research", topic: "ai-tech", label: "AI research", keywords: ["artificial intelligence", "ai model", "ai models", "machine learning", "openai", "anthropic", "deepmind", "llm", "chatbot", "ai"] },
  { id: "big-tech", topic: "ai-tech", label: "Big Tech & platforms", keywords: ["google", "apple", "microsoft", "meta", "amazon", "tiktok", "social media", "platform", "platforms", "iphone"] },
  { id: "cybersecurity", topic: "ai-tech", label: "Cybersecurity", keywords: ["cyber", "hack", "hacker", "hacked", "ransomware", "data breach", "malware", "privacy", "surveillance"] },
  { id: "chips-hardware", topic: "ai-tech", label: "Chips & hardware", keywords: ["chip", "chips", "semiconductor", "nvidia", "tsmc", "hardware", "smartphone", "device"] },
  { id: "space", topic: "science", label: "Space & astronomy", keywords: ["space", "nasa", "spacex", "rocket", "moon", "mars", "planet", "telescope", "asteroid", "galaxy", "astronomer"] },
  { id: "medical-research", topic: "science", label: "Medical research", keywords: ["study", "trial", "researchers", "genome", "dna", "cells", "brain", "neuroscience"] },
  { id: "nature-earth", topic: "science", label: "Nature & earth sciences", keywords: ["species", "fossil", "evolution", "ocean", "earthquake", "geology", "wildlife"] },
  { id: "pk-politics", topic: "pakistan", label: "Pakistani politics", keywords: ["pti", "pml-n", "ppp", "imran khan", "shehbaz", "national assembly", "senate", "governor", "chief minister", "election commission"] },
  { id: "pk-economy", topic: "pakistan", label: "Pakistan's economy", keywords: ["imf", "sbp", "rupee", "pkr", "psx", "inflation", "budget", "remittances", "circular debt"] },
  { id: "pk-cities", topic: "pakistan", label: "Karachi, Lahore & Islamabad", keywords: ["karachi", "lahore", "islamabad", "rawalpindi", "peshawar", "quetta"] },
  { id: "diplomacy", topic: "world", label: "Diplomacy & geopolitics", keywords: ["diplomat", "diplomacy", "summit", "foreign minister", "sanctions", "treaty", "united nations", "talks"] },
  { id: "conflict", topic: "world", label: "Conflict & security", keywords: ["war", "ceasefire", "troops", "military", "missile", "strike", "strikes", "attack", "militants"] },
  { id: "south-asia", topic: "world", label: "South Asia", keywords: ["india", "afghanistan", "bangladesh", "sri lanka", "nepal", "kabul", "delhi", "dhaka", "taliban"] },
  { id: "scholarships", topic: "education", label: "Scholarships & fellowships", keywords: ["scholarship", "scholarships", "fellowship", "fellowships", "fulbright", "chevening", "erasmus", "grant", "grants", "funded"] },
  { id: "universities", topic: "education", label: "Universities & admissions", keywords: ["university", "universities", "admissions", "campus", "HEC", "degree", "phd", "students"] },
  { id: "schools", topic: "education", label: "Schools & exams", keywords: ["school", "schools", "exam", "exams", "pupils", "teachers", "curriculum", "matric", "o level", "a level"] },
  { id: "startups", topic: "business", label: "Startups & venture", keywords: ["startup", "startups", "founder", "founders", "funding", "venture capital", "seed round", "series a", "unicorn"] },
  { id: "markets", topic: "business", label: "Markets & finance", keywords: ["stocks", "shares", "market", "markets", "investors", "bond", "bonds", "stock exchange", "psx", "interest rates"] },
  { id: "macro", topic: "business", label: "Inflation, jobs & trade", keywords: ["inflation", "gdp", "jobs", "unemployment", "wages", "tariff", "tariffs", "trade", "exports", "imports", "central bank"] },
  { id: "energy", topic: "climate", label: "Energy transition", keywords: ["solar", "wind power", "renewable", "renewables", "coal", "oil", "gas", "electricity", "power", "net zero", "ev", "electric vehicle"] },
  { id: "extreme-weather", topic: "climate", label: "Extreme weather", keywords: ["flood", "floods", "flooding", "drought", "heatwave", "heat wave", "cyclone", "storm", "monsoon", "wildfire", "rain"] },
  { id: "pollution", topic: "climate", label: "Air & pollution", keywords: ["smog", "pollution", "air quality", "emissions", "plastic", "waste"] },
  { id: "public-health", topic: "health", label: "Public health", keywords: ["polio", "dengue", "malaria", "vaccine", "vaccination", "outbreak", "WHO", "public health"] },
  { id: "mental-health", topic: "health", label: "Mental health", keywords: ["mental health", "anxiety", "depression", "wellbeing", "loneliness", "stress"] },
  { id: "cricket", topic: "sports", label: "Cricket", keywords: ["cricket", "psl", "pcb", "icc", "test match", "odi", "t20", "wicket", "batter", "bowler", "babar"] },
  { id: "football", topic: "sports", label: "Football", keywords: ["football", "soccer", "premier league", "champions league", "fifa", "goal", "striker"] },
  { id: "film-tv", topic: "culture", label: "Film & TV", keywords: ["film", "films", "movie", "cinema", "netflix", "series", "television", "drama", "actor", "director"] },
  { id: "books-ideas", topic: "culture", label: "Books & ideas", keywords: ["book", "books", "novel", "author", "literature", "poetry", "prize"] },
  { id: "music-art", topic: "culture", label: "Music & art", keywords: ["music", "album", "singer", "song", "concert", "art", "artist", "museum", "exhibition"] },
  { id: "rights-gender", topic: "society", label: "Rights & gender", keywords: ["human rights", "women", "gender", "girls", "rights", "equality", "minorities"] },
  { id: "development", topic: "society", label: "Poverty & development", keywords: ["poverty", "development", "aid", "humanitarian", "inequality", "welfare", "displacement"] },
];

export const INTEREST_BY_ID: Record<string, InterestDef> = Object.fromEntries(INTERESTS.map((i) => [i.id, i]));

export function isTopicId(value: string): value is TopicId {
  return (TOPIC_IDS as readonly string[]).includes(value);
}

export function topicLabel(id: string): string {
  return isTopicId(id) ? TOPICS[id].label : id;
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export interface RegionDef {
  code: string;
  name: string;
  /** Terms that indicate a story is about this region. */
  keywords: string[];
}

export const REGIONS: RegionDef[] = [
  { code: "PK", name: "Pakistan", keywords: ["pakistan", "pakistani", "islamabad", "karachi", "lahore", "peshawar", "quetta", "rawalpindi", "punjab", "sindh", "balochistan", "khyber pakhtunkhwa", "k-p", "gilgit", "pti", "pml-n"] },
  { code: "IN", name: "India", keywords: ["india", "indian", "delhi", "mumbai", "modi", "bengaluru", "kolkata"] },
  { code: "BD", name: "Bangladesh", keywords: ["bangladesh", "bangladeshi", "dhaka"] },
  { code: "AE", name: "United Arab Emirates", keywords: ["uae", "emirates", "dubai", "abu dhabi"] },
  { code: "SA", name: "Saudi Arabia", keywords: ["saudi", "riyadh", "jeddah"] },
  { code: "GB", name: "United Kingdom", keywords: ["uk", "britain", "british", "england", "scotland", "wales", "london", "nhs", "starmer"] },
  { code: "US", name: "United States", keywords: ["us", "u.s.", "america", "american", "washington", "white house", "congress", "new york", "california"] },
  { code: "CA", name: "Canada", keywords: ["canada", "canadian", "ottawa", "toronto"] },
  { code: "AU", name: "Australia", keywords: ["australia", "australian", "sydney", "melbourne", "canberra"] },
  { code: "NG", name: "Nigeria", keywords: ["nigeria", "nigerian", "lagos", "abuja"] },
  { code: "KE", name: "Kenya", keywords: ["kenya", "kenyan", "nairobi"] },
  { code: "ZA", name: "South Africa", keywords: ["south africa", "south african", "johannesburg", "cape town"] },
];

export const GLOBAL_REGION = "GLOBAL";

export const REGION_BY_CODE: Record<string, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.code, r]));

export function regionName(code: string): string {
  if (code === GLOBAL_REGION) return "the world";
  return REGION_BY_CODE[code]?.name ?? code;
}

// ---------------------------------------------------------------------------
// Text utilities shared by the classifier, dedupe and similarity code
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by for from has have he her his how i if in into is it its of on or our " +
    "says said say she so than that the their them they this to up was we were what when where which who why " +
    "will with would you your after over new more about amid not no can could may might just also out off " +
    "its it's than then there these those very first last two one three year years day days week weeks " +
    "being do does did get gets got make makes made"
  ).split(" "),
);

/** Lower-cased word tokens without punctuation (keeps hyphenated words like "k-p"). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .split(/[^a-z0-9.\-]+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
    .filter(Boolean);
}

/** Very light stemmer: enough to match "floods"/"flood" and "studies"/"study". */
export function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return token.slice(0, -3) + "y";
  if (token.length > 4 && token.endsWith("es") && /(ches|shes|sses|xes)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("us")) return token.slice(0, -1);
  return token;
}

/** Content tokens for similarity: stopwords removed, stemmed, deduplicated. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokenize(text)) {
    if (t.length < 2 || STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
    out.add(stem(t));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Overlap coefficient — robust when one headline is much shorter than the other. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

/** Similarity of two headlines in [0,1], combining Jaccard and overlap. */
export function headlineSimilarity(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.size < 2 || tb.size < 2) return 0;
  return 0.5 * jaccard(ta, tb) + 0.5 * overlap(ta, tb) * Math.min(1, Math.min(ta.size, tb.size) / 4);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const keywordRegexCache = new Map<string, RegExp>();
function keywordRegex(keyword: string): RegExp {
  let re = keywordRegexCache.get(keyword);
  if (!re) {
    // Word-boundary match that also tolerates simple plurals ("flood" matches "floods").
    re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}(s|es)?(?=$|[^a-z0-9])`, "i");
    keywordRegexCache.set(keyword, re);
  }
  return re;
}

/** Returns the keywords from `keywords` that occur in `text`. */
export function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const k of keywords) {
    // Two-letter keywords ("ai", "us", "un") and keywords written with capitals ("WHO", "HEC") are
    // matched case-sensitively so the pronouns "us" and "who" do not count as topic evidence.
    if (k.length <= 2 || k !== k.toLowerCase()) {
      const needle = k.length <= 2 ? k.toUpperCase() : k;
      const re = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(needle)}(?=$|[^A-Za-z0-9])`);
      if (re.test(text)) hits.push(k);
      continue;
    }
    if (keywordRegex(k).test(lower)) hits.push(k);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export interface ClassifyInput {
  title: string;
  description: string;
  categories?: string[];
  sourceTopics?: TopicId[];
  sourceRegion?: string;
  /** Treat stories as local to sourceRegion unless they are clearly about elsewhere. */
  localByDefault?: boolean;
}

export interface Classification {
  topics: TopicId[];
  regions: string[];
  topicScores: Partial<Record<TopicId, number>>;
}

/**
 * Deterministic classifier. Title hits weigh more than description hits; the source's declared
 * topics act as a prior. Returns up to three topics, strongest first.
 */
export function classifyArticle(input: ClassifyInput): Classification {
  const title = input.title;
  const body = `${input.description} ${(input.categories ?? []).join(" ")}`;
  const scores: Partial<Record<TopicId, number>> = {};

  for (const id of TOPIC_IDS) {
    const def = TOPICS[id];
    const titleHits = matchKeywords(title, def.keywords).length;
    const bodyHits = matchKeywords(body, def.keywords).length;
    let score = titleHits * 2 + Math.min(bodyHits, 4);
    if (input.sourceTopics?.includes(id)) score += input.sourceTopics.length === 1 ? 3 : 1.5;
    if (score > 0) scores[id] = score;
  }

  // Region detection
  const regions = new Set<string>();
  const text = `${title} ${input.description}`;
  for (const r of REGIONS) {
    const titleHits = matchKeywords(title, r.keywords).length;
    const bodyHits = matchKeywords(input.description, r.keywords).length;
    if (titleHits > 0 || bodyHits >= 2) regions.add(r.code);
  }
  if (input.sourceRegion && input.sourceRegion !== GLOBAL_REGION) {
    const mentionsHome = matchKeywords(text, REGION_BY_CODE[input.sourceRegion]?.keywords ?? []).length > 0;
    const elsewhere = [...regions].some((r) => r !== input.sourceRegion);
    // Dedicated national feeds are local unless clearly about somewhere else; mixed feeds only when the text says so.
    if (mentionsHome || (input.localByDefault && !elsewhere)) regions.add(input.sourceRegion);
  }
  if (regions.has("PK")) scores.pakistan = (scores.pakistan ?? 0) + 2;
  if (regions.size === 0) regions.add(GLOBAL_REGION);

  const ranked = (Object.entries(scores) as [TopicId, number][])
    .sort((a, b) => b[1] - a[1] || TOPIC_IDS.indexOf(a[0]) - TOPIC_IDS.indexOf(b[0]));
  const top = ranked[0]?.[1] ?? 0;
  const topics = ranked.filter(([, s], i) => i === 0 || s >= Math.max(2, top * 0.5)).slice(0, 3).map(([id]) => id);
  if (topics.length === 0) topics.push(input.sourceTopics?.[0] ?? "world");

  return { topics, regions: [...regions], topicScores: scores };
}

export interface InterestMatch {
  interest: InterestDef;
  /** Keyword found in the headline (strong evidence). */
  inTitle: boolean;
  keywords: string[];
}

/**
 * Interests supported by the text: one keyword in the headline, or at least two distinct
 * keywords in the excerpt. A single passing mention in the body is not enough.
 */
export function matchInterests(title: string, body: string, interestIds: string[]): InterestMatch[] {
  const out: InterestMatch[] = [];
  for (const id of interestIds) {
    const def = INTEREST_BY_ID[id];
    if (!def) continue;
    const t = matchKeywords(title, def.keywords);
    const b = matchKeywords(body, def.keywords).filter((k) => !t.includes(k));
    if (t.length > 0 || b.length >= 2) out.push({ interest: def, inTitle: t.length > 0, keywords: [...t, ...b] });
  }
  return out.sort((x, y) => Number(y.inTitle) - Number(x.inTitle) || y.keywords.length - x.keywords.length);
}

const KEEP_CAPITAL = new Set(["AI", "Big", "Pakistan's", "Pakistani", "Karachi", "South"]);

/** "AI research" stays as is; "Space & astronomy" becomes "space & astronomy" mid-sentence. */
export function interestPhrase(def: InterestDef): string {
  const first = def.label.split(" ")[0] ?? "";
  return KEEP_CAPITAL.has(first) ? def.label : def.label.charAt(0).toLowerCase() + def.label.slice(1);
}
