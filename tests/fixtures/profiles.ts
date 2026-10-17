import { normalizePreferences } from "@/lib/preferences";

/** The three reference readers used by tests and the evaluation script. */
export const PROFILES = {
  aiResearcher: normalizePreferences({
    displayName: "Ayesha",
    sections: ["ai-tech", "science", "business"],
    interests: ["ai-research", "chips-hardware", "startups", "cybersecurity"],
    region: "GLOBAL",
    depth: "deep",
    readingMinutes: 25,
    timezone: "Asia/Karachi",
  }),
  pakistanStudent: normalizePreferences({
    displayName: "Hamza",
    sections: ["pakistan", "education", "business"],
    interests: ["scholarships", "universities", "pk-economy", "macro", "cricket"],
    region: "PK",
    localBalance: 0.75,
    depth: "balanced",
    readingMinutes: 15,
    timezone: "Asia/Karachi",
  }),
  climateReader: normalizePreferences({
    displayName: "Sara",
    sections: ["climate", "science", "health"],
    interests: ["energy", "extreme-weather", "pollution", "space", "public-health"],
    region: "GB",
    localBalance: 0.3,
    depth: "balanced",
    readingMinutes: 15,
    timezone: "Europe/London",
  }),
};
