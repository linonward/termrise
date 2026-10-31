// Imports keyword-lab's pool into the keyword pool (docs/product/keyword-pool.md#keyword-lab).
// Run: DATABASE_URL=<connection string> pnpm pool:import <keyword-lab directory>
// A rerun skips keywords imported before.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createDb } from "@repo/db/client";
import { importKeywordLab } from "@repo/research/pool-import";

const dir = process.argv[2];
if (!dir || !process.env.DATABASE_URL) {
  console.error(
    "Usage: DATABASE_URL=<url> pnpm pool:import <keyword-lab directory>",
  );
  process.exit(2);
}
const research = join(dir, "research");
const rounds = readdirSync(research)
  .filter((f) => /^keyword-research-.*\.csv$/.test(f))
  .map((f) => readFileSync(join(research, f), "utf8"));
const database = createDb(process.env.DATABASE_URL);
const result = await importKeywordLab(database, {
  pool: readFileSync(join(research, "pool.csv"), "utf8"),
  rounds,
});
console.log(
  `imported ${result.imported}, skipped ${result.skipped} (already imported)`,
);
process.exit(0);
