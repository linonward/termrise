// Merges a keyword tool's CSV / TSV export into seo/keywords.csv. Run from the
// repository root:
//   node .claude/skills/seo-keyword-matrix/scripts/import.mjs <file> \
//     --source <tool> --keyword <column> [--volume <column>] [--difficulty <column>]
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  formatKeywordsCsv,
  mergeKeywords,
  readExport,
  readKeywordsCsv,
} from "./keywords.mjs";

const KEYWORDS_FILE = new URL("../../../../seo/keywords.csv", import.meta.url);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: "string" },
    keyword: { type: "string" },
    volume: { type: "string" },
    difficulty: { type: "string" },
  },
});
const [file] = positionals;
if (!file || !values.source || !values.keyword) {
  console.error("Usage: import.mjs <file> --source <tool> --keyword <column>");
  process.exit(1);
}

const incoming = readExport(
  readFileSync(file, "utf8"),
  {
    keyword: values.keyword,
    volume: values.volume,
    difficulty: values.difficulty,
  },
  values.source,
);
const existing = readKeywordsCsv(readFileSync(KEYWORDS_FILE, "utf8"));
const merged = mergeKeywords(existing, incoming);
writeFileSync(KEYWORDS_FILE, formatKeywordsCsv(merged));
console.log(
  `Read ${incoming.length} keywords, ${merged.length - existing.length} new; seo/keywords.csv has ${merged.length}`,
);
