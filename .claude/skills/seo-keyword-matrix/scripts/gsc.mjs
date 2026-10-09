// Search Console query × page data: where Google actually shows the site's pages.
import { normalizeKeyword, readColumns, readNumber } from "./keywords.mjs";

/**
 * @typedef {object} GscRow
 * @property {string} query
 * @property {string} page
 * @property {number} clicks
 * @property {number} impressions
 * @property {number} position Average position, 1 = top.
 */

/**
 * @param {string} text
 * @param {{ query: string; page: string; clicks: string; impressions: string; position: string }} columns
 * @returns {GscRow[]}
 */
export function readGscExport(text, columns) {
  return readColumns(text, columns).flatMap((row) => {
    const query = normalizeKeyword(row.query ?? "");
    const page = row.page?.trim() ?? "";
    if (query === "" || page === "") return [];
    return [
      {
        query,
        page,
        clicks: readNumber(row.clicks) ?? 0,
        impressions: readNumber(row.impressions) ?? 0,
        position: readNumber(row.position) ?? 0,
      },
    ];
  });
}

/**
 * Queries for which Google shows two or more of the site's pages: the pages
 * compete for the same search. Largest first.
 * @param {GscRow[]} rows
 * @param {number} [minImpressions] For the query, over all its pages.
 */
export function findCannibalization(rows, minImpressions = 10) {
  /** @type {Map<string, GscRow[]>} */
  const byQuery = new Map();
  for (const row of rows)
    byQuery.set(row.query, [...(byQuery.get(row.query) ?? []), row]);
  return [...byQuery]
    .map(([query, pages]) => ({
      query,
      impressions: pages.reduce((sum, row) => sum + row.impressions, 0),
      pages: pages.sort((a, b) => b.impressions - a.impressions),
    }))
    .filter((q) => q.pages.length >= 2 && q.impressions >= minImpressions)
    .sort((a, b) => b.impressions - a.impressions);
}

/**
 * Pages at average positions 8–20 for a query: near the first page, where a
 * better title, description or section gains the most clicks. Largest first.
 * @param {GscRow[]} rows
 * @param {{ from?: number; to?: number; minImpressions?: number }} [options]
 */
export function findStrikingDistance(
  rows,
  { from = 8, to = 20, minImpressions = 10 } = {},
) {
  return rows
    .filter(
      (row) =>
        row.position >= from &&
        row.position <= to &&
        row.impressions >= minImpressions,
    )
    .sort((a, b) => b.impressions - a.impressions);
}
