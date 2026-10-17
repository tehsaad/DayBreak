import type { TopicId } from "../topics";
import type { SourceStatus } from "../types";

/**
 * The source registry. Every feed here was checked by hand to return a valid RSS/Atom
 * document. Feeds are fetched only from this list (never from user input), which keeps
 * server-side fetching to trusted endpoints.
 */
export interface SourceDef {
  id: string;
  publisher: string;
  name: string;
  feedUrl: string;
  homepage: string;
  topics: TopicId[];
  /** Country code or "GLOBAL". */
  region: string;
  status: SourceStatus;
  /** Lower number is fetched first when the time budget is tight. */
  priority: 1 | 2 | 3;
  /** Some publishers put the full article in <description>; we cap the excerpt harder for them. */
  fullTextInFeed?: boolean;
  /**
   * Dedicated national-news feeds: their stories are local by default. General "home"/"latest"
   * feeds from national publishers also carry foreign wire copy, so for those a story is only
   * local when it actually mentions the country.
   */
  localByDefault?: boolean;
}

export const SOURCES: SourceDef[] = [
  // International general news
  { id: "bbc-world", publisher: "BBC News", name: "BBC News — World", feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml", homepage: "https://www.bbc.com/news/world", topics: ["world"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "bbc-asia", publisher: "BBC News", name: "BBC News — Asia", feedUrl: "https://feeds.bbci.co.uk/news/world/asia/rss.xml", homepage: "https://www.bbc.com/news/world/asia", topics: ["world"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "guardian-world", publisher: "The Guardian", name: "The Guardian — World", feedUrl: "https://www.theguardian.com/world/rss", homepage: "https://www.theguardian.com/world", topics: ["world"], region: "GLOBAL", status: "active", priority: 2 },
  { id: "npr-news", publisher: "NPR", name: "NPR — News", feedUrl: "https://feeds.npr.org/1001/rss.xml", homepage: "https://www.npr.org", topics: ["world"], region: "US", status: "active", priority: 3 },
  { id: "un-news", publisher: "UN News", name: "UN News", feedUrl: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", homepage: "https://news.un.org", topics: ["world", "society"], region: "GLOBAL", status: "active", priority: 2 },

  // Pakistan
  { id: "dawn-home", publisher: "Dawn", name: "Dawn — Home", feedUrl: "https://www.dawn.com/feeds/home", homepage: "https://www.dawn.com", topics: [], region: "PK", status: "active", priority: 1, fullTextInFeed: true },
  { id: "dawn-pakistan", publisher: "Dawn", name: "Dawn — Pakistan", feedUrl: "https://www.dawn.com/feeds/pakistan", homepage: "https://www.dawn.com/pakistan", topics: ["pakistan"], region: "PK", status: "active", priority: 1, localByDefault: true, fullTextInFeed: true },
  { id: "dawn-business", publisher: "Dawn", name: "Dawn — Business", feedUrl: "https://www.dawn.com/feeds/business", homepage: "https://www.dawn.com/business", topics: ["business"], region: "PK", status: "active", priority: 2, fullTextInFeed: true },
  { id: "tribune-pakistan", publisher: "The Express Tribune", name: "Express Tribune — Pakistan", feedUrl: "https://tribune.com.pk/feed/pakistan", homepage: "https://tribune.com.pk", topics: ["pakistan"], region: "PK", status: "active", priority: 1, localByDefault: true },
  { id: "tribune-business", publisher: "The Express Tribune", name: "Express Tribune — Business", feedUrl: "https://tribune.com.pk/feed/business", homepage: "https://tribune.com.pk/business", topics: ["business"], region: "PK", status: "active", priority: 2 },
  { id: "tribune-tech", publisher: "The Express Tribune", name: "Express Tribune — Technology", feedUrl: "https://tribune.com.pk/feed/technology", homepage: "https://tribune.com.pk/technology", topics: ["ai-tech"], region: "PK", status: "active", priority: 3 },
  { id: "geo-pakistan", publisher: "Geo News", name: "Geo News — Pakistan", feedUrl: "https://www.geo.tv/rss/1/1", homepage: "https://www.geo.tv", topics: ["pakistan"], region: "PK", status: "active", priority: 2, localByDefault: true },
  { id: "brecorder", publisher: "Business Recorder", name: "Business Recorder — Latest", feedUrl: "https://www.brecorder.com/feeds/latest-news", homepage: "https://www.brecorder.com", topics: [], region: "PK", status: "active", priority: 2, fullTextInFeed: true },

  // Technology
  { id: "bbc-tech", publisher: "BBC News", name: "BBC News — Technology", feedUrl: "https://feeds.bbci.co.uk/news/technology/rss.xml", homepage: "https://www.bbc.com/news/technology", topics: ["ai-tech"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "guardian-tech", publisher: "The Guardian", name: "The Guardian — Technology", feedUrl: "https://www.theguardian.com/technology/rss", homepage: "https://www.theguardian.com/technology", topics: ["ai-tech"], region: "GLOBAL", status: "active", priority: 2 },
  { id: "ars-technica", publisher: "Ars Technica", name: "Ars Technica", feedUrl: "https://feeds.arstechnica.com/arstechnica/index", homepage: "https://arstechnica.com", topics: ["ai-tech", "science"], region: "GLOBAL", status: "active", priority: 2 },
  { id: "mit-tech-review", publisher: "MIT Technology Review", name: "MIT Technology Review", feedUrl: "https://www.technologyreview.com/feed/", homepage: "https://www.technologyreview.com", topics: ["ai-tech"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "the-verge", publisher: "The Verge", name: "The Verge", feedUrl: "https://www.theverge.com/rss/index.xml", homepage: "https://www.theverge.com", topics: ["ai-tech"], region: "GLOBAL", status: "active", priority: 3 },
  { id: "techcrunch", publisher: "TechCrunch", name: "TechCrunch", feedUrl: "https://techcrunch.com/feed/", homepage: "https://techcrunch.com", topics: ["ai-tech", "business"], region: "GLOBAL", status: "active", priority: 2 },
  { id: "rest-of-world", publisher: "Rest of World", name: "Rest of World", feedUrl: "https://restofworld.org/feed/latest", homepage: "https://restofworld.org", topics: ["ai-tech", "society"], region: "GLOBAL", status: "active", priority: 2 },

  // Science
  { id: "bbc-science", publisher: "BBC News", name: "BBC News — Science & Environment", feedUrl: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", homepage: "https://www.bbc.com/news/science_and_environment", topics: ["science", "climate"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "guardian-science", publisher: "The Guardian", name: "The Guardian — Science", feedUrl: "https://www.theguardian.com/science/rss", homepage: "https://www.theguardian.com/science", topics: ["science"], region: "GLOBAL", status: "active", priority: 2 },
  { id: "nature-news", publisher: "Nature", name: "Nature", feedUrl: "https://www.nature.com/nature.rss", homepage: "https://www.nature.com", topics: ["science"], region: "GLOBAL", status: "active", priority: 2 },
  { id: "sciencedaily", publisher: "ScienceDaily", name: "ScienceDaily — All", feedUrl: "https://www.sciencedaily.com/rss/all.xml", homepage: "https://www.sciencedaily.com", topics: ["science"], region: "GLOBAL", status: "active", priority: 3 },
  { id: "quanta", publisher: "Quanta Magazine", name: "Quanta Magazine", feedUrl: "https://www.quantamagazine.org/feed/", homepage: "https://www.quantamagazine.org", topics: ["science"], region: "GLOBAL", status: "active", priority: 3 },
  { id: "npr-science", publisher: "NPR", name: "NPR — Science", feedUrl: "https://feeds.npr.org/1007/rss.xml", homepage: "https://www.npr.org/sections/science", topics: ["science"], region: "US", status: "active", priority: 3 },

  // Climate & environment
  { id: "guardian-environment", publisher: "The Guardian", name: "The Guardian — Environment", feedUrl: "https://www.theguardian.com/environment/rss", homepage: "https://www.theguardian.com/environment", topics: ["climate"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "carbon-brief", publisher: "Carbon Brief", name: "Carbon Brief", feedUrl: "https://www.carbonbrief.org/feed/", homepage: "https://www.carbonbrief.org", topics: ["climate"], region: "GLOBAL", status: "active", priority: 2, fullTextInFeed: true },

  // Business
  { id: "bbc-business", publisher: "BBC News", name: "BBC News — Business", feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml", homepage: "https://www.bbc.com/news/business", topics: ["business"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "guardian-business", publisher: "The Guardian", name: "The Guardian — Business", feedUrl: "https://www.theguardian.com/business/rss", homepage: "https://www.theguardian.com/business", topics: ["business"], region: "GLOBAL", status: "active", priority: 3 },

  // Health
  { id: "bbc-health", publisher: "BBC News", name: "BBC News — Health", feedUrl: "https://feeds.bbci.co.uk/news/health/rss.xml", homepage: "https://www.bbc.com/news/health", topics: ["health"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "who-news", publisher: "World Health Organization", name: "WHO — News", feedUrl: "https://www.who.int/rss-feeds/news-english.xml", homepage: "https://www.who.int/news", topics: ["health"], region: "GLOBAL", status: "active", priority: 2 },
  { id: "npr-health", publisher: "NPR", name: "NPR — Health", feedUrl: "https://feeds.npr.org/1128/rss.xml", homepage: "https://www.npr.org/sections/health", topics: ["health"], region: "US", status: "active", priority: 3 },

  // Education
  { id: "bbc-education", publisher: "BBC News", name: "BBC News — Education", feedUrl: "https://feeds.bbci.co.uk/news/education/rss.xml", homepage: "https://www.bbc.com/news/education", topics: ["education"], region: "GB", status: "active", priority: 1 },
  { id: "guardian-education", publisher: "The Guardian", name: "The Guardian — Education", feedUrl: "https://www.theguardian.com/education/rss", homepage: "https://www.theguardian.com/education", topics: ["education"], region: "GB", status: "active", priority: 2 },
  { id: "inside-higher-ed", publisher: "Inside Higher Ed", name: "Inside Higher Ed", feedUrl: "https://insidehighered.com/rss.xml", homepage: "https://www.insidehighered.com", topics: ["education"], region: "US", status: "active", priority: 2 },

  // Sport
  { id: "bbc-sport", publisher: "BBC Sport", name: "BBC Sport", feedUrl: "https://feeds.bbci.co.uk/sport/rss.xml", homepage: "https://www.bbc.com/sport", topics: ["sports"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "dawn-sport", publisher: "Dawn", name: "Dawn — Sport", feedUrl: "https://www.dawn.com/feeds/sport", homepage: "https://www.dawn.com/sport", topics: ["sports"], region: "PK", status: "active", priority: 2, fullTextInFeed: true },
  { id: "cricinfo", publisher: "ESPNcricinfo", name: "ESPNcricinfo", feedUrl: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml", homepage: "https://www.espncricinfo.com", topics: ["sports"], region: "GLOBAL", status: "active", priority: 2 },

  // Culture & society
  { id: "bbc-arts", publisher: "BBC News", name: "BBC News — Entertainment & Arts", feedUrl: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", homepage: "https://www.bbc.com/news/entertainment_and_arts", topics: ["culture"], region: "GLOBAL", status: "active", priority: 1 },
  { id: "guardian-culture", publisher: "The Guardian", name: "The Guardian — Culture", feedUrl: "https://www.theguardian.com/culture/rss", homepage: "https://www.theguardian.com/culture", topics: ["culture"], region: "GLOBAL", status: "active", priority: 2 },
  { id: "guardian-society", publisher: "The Guardian", name: "The Guardian — Society", feedUrl: "https://www.theguardian.com/society/rss", homepage: "https://www.theguardian.com/society", topics: ["society"], region: "GB", status: "active", priority: 2 },
  { id: "guardian-development", publisher: "The Guardian", name: "The Guardian — Global development", feedUrl: "https://www.theguardian.com/global-development/rss", homepage: "https://www.theguardian.com/global-development", topics: ["society"], region: "GLOBAL", status: "active", priority: 2 },
];

export const SOURCE_BY_ID: Record<string, SourceDef> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

export function activeSources(): SourceDef[] {
  return SOURCES.filter((s) => s.status === "active");
}

/** Distinct publishers, for the source-exclusion control in onboarding/settings. */
export function publishers(): { id: string; publisher: string }[] {
  const seen = new Map<string, string>();
  for (const s of SOURCES) if (!seen.has(s.publisher)) seen.set(s.publisher, publisherId(s.publisher));
  return [...seen.entries()].map(([publisher, id]) => ({ id, publisher })).sort((a, b) => a.publisher.localeCompare(b.publisher));
}

export function publisherId(publisher: string): string {
  return publisher.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
