/** Dev helper: store a reference profile for a fixed demo reader id (for screenshots/demos). */
import { getFileStore } from "../src/lib/store";
import { PROFILES } from "../tests/fixtures/profiles";

const which = (process.argv[2] ?? "pakistanStudent") as keyof typeof PROFILES;
const id = process.argv[3] ?? "00000000-0000-4000-8000-000000000002";
await getFileStore().savePreferences(id, PROFILES[which]);
console.log(`saved ${which} for ${id}`);
