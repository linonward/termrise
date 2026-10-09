// Reports from a Search Console query × page export: cannibalization (one query,
// several pages) and striking distance (positions 8–20). The Search Console UI
// exports queries and pages separately; take query × page from the Search
// Analytics API (dimensions query and page), Looker Studio or BigQuery.
// Run from the repository root:
//   node .claude/skills/seo-keyword-matrix/scripts/gsc-report.mjs <file> \
//     --query <column> --page <column> --clicks <column> \
//     --impressions <column> --position <column> [--min-impressions 10]
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  findCannibalization,
  findStrikingDistance,
  readGscExport,
} from "./gsc.mjs";

const MATRIX_FILE = new URL("../../../../seo/matrix.json", import.meta.url);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    query: { type: "string" },
    page: { type: "string" },
    clicks: { type: "string" },
    impressions: { type: "string" },
    position: { type: "string" },
    "min-impressions": { type: "string", default: "10" },
  },
});
const [file] = positionals;
const { query, page, clicks, impressions, position } = values;
if (!file || !query || !page || !clicks || !impressions || !position) {
  console.error(
    "Usage: gsc-report.mjs <file> --query <column> --page <column> --clicks <column> --impressions <column> --position <column>",
  );
  process.exit(1);
}

const rows = readGscExport(readFileSync(file, "utf8"), {
  query,
  page,
  clicks,
  impressions,
  position,
});
const minImpressions = Number(values["min-impressions"]);
const { clusters } = JSON.parse(readFileSync(MATRIX_FILE, "utf8"));

/**
 * The page's path with the id of the cluster mapped to it, if any.
 * @param {string} url
 */
function label(url) {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {}
  const cluster = clusters.find(
    (c) => c.status !== "rejected" && c.page.path === path,
  );
  return cluster ? `${path} [${cluster.id}]` : path;
}

/** @param {{ impressions: number; clicks: number; position: number }} row */
const figures = (row) =>
  `${row.impressions} impr, ${row.clicks} clicks, pos ${row.position.toFixed(1)}`;

console.log("Cannibalization: one query, several pages");
for (const q of findCannibalization(rows, minImpressions)) {
  console.log(`  ${q.query} (${q.impressions} impr)`);
  for (const row of q.pages)
    console.log(`    ${label(row.page)}  ${figures(row)}`);
}

console.log("\nStriking distance: positions 8–20");
for (const row of findStrikingDistance(rows, { minImpressions }))
  console.log(`  ${row.query}  →  ${label(row.page)}  ${figures(row)}`);
