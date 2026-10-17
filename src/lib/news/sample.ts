import type { Article } from "../types";
import { classifyArticle, type TopicId } from "../topics";

/**
 * Clearly labelled SAMPLE articles for offline demos and tests.
 *
 * These are fictional and are never presented as news: every item has `sample: true`, the
 * publisher is "Sample Wire (demo data)", links point to docs/SAMPLE_DATA.md, and the UI
 * shows a "Sample" badge plus an edition-wide banner whenever they are used.
 */
export const SAMPLE_PUBLISHERS = ["Sample Wire (demo data)", "Sample Ledger (demo data)"] as const;
const DOC = "https://github.com/tehsaad/DayBreak/blob/main/docs/SAMPLE_DATA.md";

type Seed = [id: string, hoursAgo: number, publisher: 0 | 1, topics: TopicId[], region: string, title: string, description: string];

const SEEDS: Seed[] = [
  ["s01", 2, 0, ["ai-tech"], "GLOBAL", "Open research lab releases a small AI model that runs on laptops", "A research group published a compact language model and its training data, saying it matches larger systems on reading-comprehension benchmarks while running on consumer hardware."],
  ["s02", 3, 1, ["ai-tech"], "GLOBAL", "Small AI model that runs on laptops draws praise and scepticism", "Independent researchers welcomed the openly released compact model but cautioned that benchmark results do not always reflect real-world reliability."],
  ["s03", 5, 0, ["ai-tech", "society"], "GLOBAL", "Regulators publish draft rules for AI systems used in hiring", "The draft would require employers to disclose when automated tools screen job applicants and to offer a human review on request."],
  ["s04", 7, 0, ["ai-tech"], "GLOBAL", "Chipmaker reports record demand for data-centre processors", "The company said orders from cloud providers more than doubled over the year, and warned that supply would remain tight."],
  ["s05", 9, 1, ["ai-tech"], "GLOBAL", "Security researchers disclose flaw in popular messaging app", "The researchers said the vulnerability has been patched and urged users to install the latest update."],
  ["s06", 4, 0, ["pakistan", "education"], "PK", "Higher Education Commission announces new need-based scholarships for Pakistani students", "The commission said the programme will fund undergraduate study at public universities, with applications opening next month through its online portal."],
  ["s07", 6, 1, ["pakistan", "business"], "PK", "Karachi traders welcome fall in fuel prices", "Traders in Karachi said lower transport costs could ease pressure on food prices if the reduction holds."],
  ["s08", 8, 0, ["pakistan"], "PK", "Lahore launches smog response plan ahead of winter", "City officials in Lahore announced school timing changes, traffic restrictions and air-quality alerts for days when pollution readings are severe."],
  ["s09", 10, 1, ["pakistan", "business"], "PK", "Pakistan's central bank holds interest rate steady", "The State Bank of Pakistan kept its policy rate unchanged, citing a need to see inflation settle before easing further."],
  ["s10", 12, 0, ["pakistan", "sports"], "PK", "Pakistan name young squad for home Test series", "The selectors picked three uncapped players for the series, saying they wanted to build depth before next year's tournaments."],
  ["s11", 5, 0, ["education"], "GLOBAL", "Universities expand online courses for students in remote areas", "Several universities said they would offer accredited online modules to students who cannot relocate for study."],
  ["s12", 11, 1, ["education"], "GLOBAL", "International fellowship opens applications for early-career researchers", "The fully funded fellowship covers two years of research abroad; applicants must hold a master's degree."],
  ["s13", 3, 0, ["climate"], "GLOBAL", "Glacier monitoring network records faster melting this summer", "Scientists running the monitoring network said ice loss at several high-altitude sites was above the long-term average."],
  ["s14", 6, 1, ["climate", "pakistan"], "PK", "Northern Pakistan communities prepare for glacial lake flood risk", "Local officials said early-warning sirens and evacuation drills were being expanded to more valleys in Gilgit-Baltistan."],
  ["s15", 8, 0, ["climate", "business"], "GLOBAL", "Solar installations reach a new annual high, energy agency says", "The agency said falling panel prices drove the increase, while grid connections remained a bottleneck in many countries."],
  ["s16", 14, 1, ["climate"], "GLOBAL", "Heatwave warnings issued across several regions", "Forecasters advised people to limit outdoor work during the hottest hours and check on elderly neighbours."],
  ["s17", 4, 0, ["science"], "GLOBAL", "Telescope captures detailed images of a distant planet's atmosphere", "Astronomers said the observations reveal water vapour and clouds, and that more data is needed to confirm other molecules."],
  ["s18", 9, 1, ["science", "health"], "GLOBAL", "Study links regular sleep schedules to better memory in teenagers", "The observational study followed students for a school year; the authors said it cannot show cause and effect."],
  ["s19", 13, 0, ["science"], "GLOBAL", "Researchers sequence genome of a drought-tolerant wheat variety", "The team said the work could help breeders develop crops for drier climates, though field trials will take years."],
  ["s20", 5, 1, ["health"], "GLOBAL", "Health agency reports progress in childhood vaccination campaign", "The agency said coverage rose in most regions but warned that gaps remain in conflict-affected areas."],
  ["s21", 7, 0, ["health", "pakistan"], "PK", "Polio vaccination drive begins across Pakistan", "Health workers began a door-to-door campaign aimed at reaching millions of children under five."],
  ["s22", 15, 1, ["health"], "GLOBAL", "Hospitals trial shorter waiting lists with new triage system", "Early results from the pilot suggest fewer missed appointments; the evaluation is not yet complete."],
  ["s23", 2, 0, ["world"], "GLOBAL", "Foreign ministers meet to discuss regional trade corridor", "Officials said the talks focused on customs procedures and rail links; no agreement was signed."],
  ["s24", 6, 1, ["world"], "GLOBAL", "Ceasefire talks resume with international mediators", "Mediators said both delegations had agreed to continue discussions next week."],
  ["s25", 10, 0, ["world", "society"], "GLOBAL", "UN agency appeals for funding as displacement rises", "The agency said its programmes for displaced families were underfunded and that food rations may be reduced."],
  ["s26", 4, 1, ["business"], "GLOBAL", "Global markets steady as investors await inflation data", "Stocks were little changed in early trading, with analysts saying investors were cautious ahead of new figures."],
  ["s27", 8, 0, ["business", "ai-tech"], "GLOBAL", "Fintech startup raises funding to expand mobile payments", "The company said it will use the investment to reach small merchants and add savings features."],
  ["s28", 12, 1, ["business"], "GLOBAL", "Shipping costs ease as port congestion clears", "Freight analysts said rates have fallen from their peak but remain above pre-pandemic levels."],
  ["s29", 3, 0, ["sports"], "GLOBAL", "Cricket board confirms schedule for women's championship", "The board said matches will be played across three venues and broadcast live."],
  ["s30", 9, 1, ["sports"], "GLOBAL", "Football club appoints new head coach after poor start", "The club said the coach signed a two-year contract and will take charge before the weekend's match."],
  ["s31", 5, 0, ["culture"], "GLOBAL", "Film festival opens with a debut feature from a young director", "Organisers said this year's programme includes more first-time filmmakers than ever."],
  ["s32", 11, 1, ["culture", "pakistan"], "PK", "Lahore literary festival announces its line-up", "The festival will feature writers in Urdu, Punjabi and English, with sessions on translation and publishing."],
  ["s33", 7, 0, ["society"], "GLOBAL", "Report finds more girls completing secondary school", "The report credited scholarships and safer transport, but said progress is uneven between urban and rural areas."],
  ["s34", 13, 1, ["society", "pakistan"], "PK", "Community groups in Pakistan expand free legal aid clinics", "The clinics help families with documentation, inheritance and labour disputes, organisers said."],
  ["s35", 16, 0, ["ai-tech", "education"], "GLOBAL", "Schools pilot AI tutoring tools under teacher supervision", "Teachers involved in the pilot said the tools helped with practice questions but required close checking for errors."],
  ["s36", 18, 1, ["science", "climate"], "GLOBAL", "Ocean survey maps coral reef recovery after bleaching", "Marine scientists said some reefs showed recovery, while others continued to decline."],
];

export function sampleArticles(now: Date = new Date()): Article[] {
  return SEEDS.map(([id, hoursAgo, pub, topics, region, title, description]) => {
    const { topics: classified, regions } = classifyArticle({ title, description, sourceTopics: topics, sourceRegion: region, localByDefault: true });
    const ordered = [...new Set([topics[0]!, ...classified, ...topics])].slice(0, 3);
    const t = new Date(now.getTime() - hoursAgo * 3600_000).toISOString();
    return {
      id: `sample-${id}`,
      url: `${DOC}#${id}`,
      title,
      description,
      publisher: SAMPLE_PUBLISHERS[pub],
      sourceId: "sample",
      author: null,
      imageUrl: null,
      publishedAt: t,
      collectedAt: t,
      topics: ordered,
      regions: region === "GLOBAL" ? regions : [...new Set([region, ...regions.filter((r) => r !== "GLOBAL")])],
      categories: [],
      sample: true,
    };
  });
}
