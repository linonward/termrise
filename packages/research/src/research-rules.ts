// Research project rules without database code: apps/api validates with them and the web
// form shows the same limits (docs/architecture/termrise.md).

/** Default market: United States, English (DataForSEO location and language codes). */
export const DEFAULT_LOCATION_CODE = 2840;
export const DEFAULT_LANGUAGE_CODE = "en";

export const PROJECT_NAME_MAX_LENGTH = 100;
export const MAX_SEEDS = 50;
export const SEED_MAX_LENGTH = 80;
/** Largest budget per project and kind, in US dollars. */
export const MAX_BUDGET_USD = 1000;
export const DEFAULT_DATA_BUDGET_USD = 20;
export const DEFAULT_AI_BUDGET_USD = 5;

/**
 * Seed terms as stored: NFKC, trimmed, single spaces, lower case, without duplicates,
 * in the order given. Empty lines are dropped.
 */
export function normalizeSeeds(seeds: readonly string[]) {
  const seen = new Set<string>();
  for (const seed of seeds) {
    const term = seed
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (term) seen.add(term);
  }
  return [...seen];
}

/** One seed per line, as typed in the form. */
export const seedsFromText = (text: string) => normalizeSeeds(text.split("\n"));
