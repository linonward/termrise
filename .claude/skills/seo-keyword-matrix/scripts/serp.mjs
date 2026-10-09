// Clustering by search results: two keywords belong together when Google shows
// the same pages for them (references/clustering.md).
import { normalizeKeyword, readColumns, readNumber } from "./keywords.mjs";

/**
 * The same page with or without hash, trailing slash or host case.
 * @param {string} url
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    return parsed.href.replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

/**
 * The top result URLs per keyword from a SERP export, in position order. Rows
 * without a position keep the file order.
 * @param {string} text
 * @param {{ keyword: string; url: string; position?: string }} columns
 * @param {number} [top]
 * @returns {Map<string, string[]>}
 */
export function readSerpExport(text, columns, top = 10) {
  /** @type {Map<string, { url: string; position: number }[]>} */
  const results = new Map();
  readColumns(text, columns).forEach((row, i) => {
    const keyword = normalizeKeyword(row.keyword ?? "");
    const url = normalizeUrl(row.url ?? "");
    if (keyword === "" || url === "") return;
    const list = results.get(keyword) ?? [];
    list.push({ url, position: readNumber(row.position) ?? i });
    results.set(keyword, list);
  });
  return new Map(
    [...results].map(([keyword, list]) => [
      keyword,
      [
        ...new Set(
          list.sort((a, b) => a.position - b.position).map((r) => r.url),
        ),
      ].slice(0, top),
    ]),
  );
}

/**
 * @param {string[]} a
 * @param {string[]} b
 */
function sharedUrls(a, b) {
  const set = new Set(a);
  return b.filter((url) => set.has(url)).length;
}

/**
 * Hard clustering: the keyword with the most volume starts a cluster and takes
 * every keyword left whose results share at least `minShared` URLs with its own.
 * Only the leader is compared, so a cluster does not drift through chains.
 * @param {Map<string, string[]>} serps
 * @param {Map<string, number>} volumes
 * @param {number} [minShared]
 * @returns {{ primary: string; keywords: string[] }[]}
 */
export function clusterBySerp(serps, volumes, minShared = 3) {
  const order = [...serps.keys()].sort(
    (a, b) =>
      (volumes.get(b) ?? 0) - (volumes.get(a) ?? 0) || a.localeCompare(b),
  );
  const assigned = new Set();
  const clusters = [];
  for (const primary of order) {
    if (assigned.has(primary)) continue;
    const results = serps.get(primary) ?? [];
    const keywords = order.filter(
      (other) =>
        other === primary ||
        (!assigned.has(other) &&
          sharedUrls(results, serps.get(other) ?? []) >= minShared),
    );
    for (const keyword of keywords) assigned.add(keyword);
    clusters.push({ primary, keywords });
  }
  return clusters;
}
