// Radar rules without database code (docs/architecture/data-model.md#radar).
import { normalizeSeeds, SEED_MAX_LENGTH } from "./research-rules";

/** Stories read per list on each collection. */
export const RADAR_LIST_LIMIT = 60;
/** Items per page of the radar list. */
export const RADAR_PAGE_SIZE = 100;
export const RADAR_TITLE_MAX_LENGTH = 500;
export const RADAR_SORTS = ["new", "score"] as const;
export type RadarSort = (typeof RADAR_SORTS)[number];

// "Show HN: Foo – a tool for bar" → "foo – a tool for bar".
const HN_PREFIX = /^(show|ask|launch|tell) hn\s*:\s*/i;

/** The term a story title stands for: the title without its HN prefix, normalized. */
export function radarTerm(title: string) {
  return normalizeSeeds([title.replace(HN_PREFIX, "")])[0] ?? "";
}

/** A seed term from a radar term: cut at a word boundary to fit the seed limit. */
export function seedFromTerm(term: string) {
  if (term.length <= SEED_MAX_LENGTH) return term;
  const cut = term.slice(0, SEED_MAX_LENGTH + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut.slice(0, SEED_MAX_LENGTH))
    .replace(/[\s\p{P}]+$/u, "")
    .trim();
}

/** Only http(s) links are kept: the UI renders them as links. */
export function safeUrl(url: string | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
