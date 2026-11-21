// The orders of the new words' list (docs/product/keyword-pool.md#new-words, S89): the
// API sorts by them and the page offers them. Each stage has its default.

export const NEW_WORD_SORTS = [
  "verdict",
  "seen",
  "checked",
  "released",
  "burst",
  "ratio",
  "priority",
] as const;
export type NewWordSort = (typeof NEW_WORD_SORTS)[number];

export const DEFAULT_SORT = {
  decide: "verdict",
  check: "ratio",
  screen: "priority",
  skip: "checked",
  hidden: "seen",
} as const satisfies Record<string, NewWordSort>;

/** Measurements older than this show as stale in the decide and check stages. */
export const STALE_SHOWN_DAYS = 3;

/** A decision or a word waiting for its deep check whose numbers are old. */
export function isStale(
  w: { verdict: string | null; ratio: number | null; checkedAt: string | null },
  now = Date.now(),
) {
  const waiting =
    w.verdict === "worth" ||
    w.verdict === "try" ||
    (w.verdict === null && w.ratio !== null);
  return (
    waiting &&
    w.checkedAt !== null &&
    now - Date.parse(w.checkedAt) > STALE_SHOWN_DAYS * 86_400_000
  );
}
