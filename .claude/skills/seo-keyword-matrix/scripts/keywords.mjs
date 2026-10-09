// Keyword list for the keyword matrix (docs/product/ux.md#keyword-matrix). Each
// product keeps its own seo/keywords.csv and merges keyword tools' exports into it.

/**
 * @typedef {object} Keyword
 * @property {string} keyword
 * @property {number} [volume]
 * @property {number} [difficulty]
 * @property {string} source The tool the figures came from, e.g. "gsc" or "ahrefs".
 */

/** @param {string} text */
export function normalizeKeyword(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * RFC 4180 with the delimiter taken from the header line: tools export either
 * comma- or tab-separated files.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, "");
  const header = input.split("\n", 1)[0] ?? "";
  const delimiter = header.includes("\t") && !header.includes(",") ? "\t" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') field += input[++i];
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      rows.push([...row, field]);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  return rows;
}

/** @param {string} value */
function formatField(value) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * "1,200" → 1200. Ranges and placeholders ("<10", "n/a") are not figures.
 * @param {string | undefined} value
 */
export function readNumber(value) {
  const text = value?.replaceAll(",", "").trim();
  return text && /^\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;
}

/**
 * The rows of a tool's CSV / TSV export as objects with the keys of `columns`.
 * Column names differ per tool and per export, so the caller names them.
 * @template {string} K
 * @param {string} text
 * @param {Partial<Record<K, string>>} columns
 * @returns {Partial<Record<K, string>>[]}
 */
export function readColumns(text, columns) {
  const [header = [], ...rows] = parseCsv(text);
  const indexes = Object.entries(columns)
    .filter(([, name]) => name !== undefined)
    .map(([key, name]) => {
      const i = header.findIndex((column) => column.trim() === name);
      if (i === -1) throw new Error(`Column "${name}" not found`);
      return /** @type {[string, number]} */ ([key, i]);
    });
  return rows.map((row) =>
    Object.fromEntries(indexes.map(([key, i]) => [key, row[i]])),
  );
}

/**
 * Reads one keyword tool's export; the first row of a duplicate wins.
 * @param {string} text
 * @param {{ keyword: string; volume?: string; difficulty?: string }} columns
 * @param {string} source
 * @returns {Keyword[]}
 */
export function readExport(text, columns, source) {
  const seen = new Map();
  for (const row of readColumns(text, columns)) {
    const keyword = normalizeKeyword(row.keyword ?? "");
    if (keyword === "" || seen.has(keyword)) continue;
    seen.set(keyword, {
      keyword,
      volume: readNumber(row.volume),
      difficulty: readNumber(row.difficulty),
      source,
    });
  }
  return [...seen.values()];
}

/**
 * New keywords are added. A known keyword takes the new figures; a figure the
 * new export does not have keeps its old value.
 * @param {Keyword[]} existing
 * @param {Keyword[]} incoming
 * @returns {Keyword[]}
 */
export function mergeKeywords(existing, incoming) {
  const merged = new Map(existing.map((k) => [k.keyword, k]));
  for (const next of incoming) {
    const old = merged.get(next.keyword);
    merged.set(next.keyword, {
      ...old,
      ...next,
      volume: next.volume ?? old?.volume,
      difficulty: next.difficulty ?? old?.difficulty,
    });
  }
  return [...merged.values()].sort((a, b) =>
    a.keyword.localeCompare(b.keyword),
  );
}

const COLUMNS = ["keyword", "volume", "difficulty", "source"];

/**
 * @param {string} text
 * @returns {Keyword[]}
 */
export function readKeywordsCsv(text) {
  const [, ...rows] = parseCsv(text);
  return rows
    .filter(([keyword]) => keyword)
    .map(([keyword = "", volume, difficulty, source = ""]) => ({
      keyword,
      volume: readNumber(volume),
      difficulty: readNumber(difficulty),
      source,
    }));
}

/** @param {Keyword[]} keywords */
export function formatKeywordsCsv(keywords) {
  const rows = keywords.map((k) =>
    [k.keyword, String(k.volume ?? ""), String(k.difficulty ?? ""), k.source]
      .map(formatField)
      .join(","),
  );
  return [COLUMNS.join(","), ...rows].map((line) => `${line}\n`).join("");
}
