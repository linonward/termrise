// Lists the clusters in seo/matrix.json by opportunity score, and counts the
// keywords not in a cluster. Run from the repository root:
//   node .claude/skills/seo-keyword-matrix/scripts/report.mjs
import { readFileSync } from "node:fs";

import { readKeywordsCsv } from "./keywords.mjs";
import { isFirstBatch, opportunityScore } from "./score.mjs";

const SEO_DIR = new URL("../../../../seo/", import.meta.url);

const { clusters } = JSON.parse(
  readFileSync(new URL("matrix.json", SEO_DIR), "utf8"),
);
const rows = clusters
  .map((c) => ({ ...c, score: opportunityScore(c.scores) }))
  .sort((a, b) => b.score - a.score);
// * = first batch: business, intent and productFit all 4 or more.
for (const c of rows)
  console.log(
    `${isFirstBatch(c.scores) ? "*" : " "} ${String(c.score).padStart(3)}  ${c.status.padEnd(9)}  ${c.intent.padEnd(13)}  ${c.page.path.padEnd(30)}  ${c.primary}`,
  );

const clustered = new Set(clusters.flatMap((c) => c.keywords));
const keywords = readKeywordsCsv(
  readFileSync(new URL("keywords.csv", SEO_DIR), "utf8"),
);
const rest = keywords.filter((k) => !clustered.has(k.keyword));
console.log(`\n${rest.length} keywords are not in a cluster`);
