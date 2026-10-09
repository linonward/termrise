// Suggests clusters from a SERP export (the top result URLs of each keyword).
// It prints suggestions only; the agent decides and writes seo/matrix.json.
// Run from the repository root:
//   node .claude/skills/seo-keyword-matrix/scripts/cluster.mjs <file> \
//     --keyword <column> --url <column> [--position <column>] [--min 3]
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { readKeywordsCsv } from "./keywords.mjs";
import { clusterBySerp, readSerpExport } from "./serp.mjs";

const SEO_DIR = new URL("../../../../seo/", import.meta.url);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    keyword: { type: "string" },
    url: { type: "string" },
    position: { type: "string" },
    min: { type: "string", default: "3" },
  },
});
const [file] = positionals;
if (!file || !values.keyword || !values.url) {
  console.error("Usage: cluster.mjs <file> --keyword <column> --url <column>");
  process.exit(1);
}

const serps = readSerpExport(readFileSync(file, "utf8"), {
  keyword: values.keyword,
  url: values.url,
  position: values.position,
});
const keywords = readKeywordsCsv(
  readFileSync(new URL("keywords.csv", SEO_DIR), "utf8"),
);
const volumes = new Map(keywords.map((k) => [k.keyword, k.volume ?? 0]));
const { clusters } = JSON.parse(
  readFileSync(new URL("matrix.json", SEO_DIR), "utf8"),
);
/** @type {Map<string, string>} */
const owner = new Map(
  clusters.flatMap((c) => c.keywords.map((keyword) => [keyword, c.id])),
);

// [id] = the keyword is already in that cluster of seo/matrix.json.
for (const group of clusterBySerp(serps, volumes, Number(values.min)))
  console.log(
    `${group.primary} (${group.keywords.length}): ${group.keywords
      .map((k) => (owner.has(k) ? `${k} [${owner.get(k)}]` : k))
      .join(", ")}`,
  );
const missing = keywords.filter((k) => !serps.has(k.keyword));
console.log(
  `\n${missing.length} keywords in seo/keywords.csv have no SERP data`,
);
