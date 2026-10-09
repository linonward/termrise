// Opportunity score for a keyword cluster: a screening heuristic, not a ranking
// prediction. Each item is scored 1–5, see ../references/scoring.md.

/** @typedef {{ business: number; productFit: number; intent: number; competition: number; demand: number }} Scores */

// Weights sum to 100. competition: higher = easier to rank for.
/** @type {Scores} */
export const SCORE_WEIGHTS = {
  business: 30,
  productFit: 25,
  intent: 20,
  competition: 15,
  demand: 10,
};

/**
 * Maps the 1–5 scores to 0–100 by weight.
 * @param {Scores} scores
 */
export function opportunityScore(scores) {
  const total = Object.entries(SCORE_WEIGHTS).reduce(
    (sum, [key, weight]) =>
      sum + (weight * (scores[/** @type {keyof Scores} */ (key)] - 1)) / 4,
    0,
  );
  return Math.round(total);
}

/**
 * The first batch: business, intent and productFit all 4 or more.
 * @param {Scores} scores
 */
export function isFirstBatch(scores) {
  return scores.business >= 4 && scores.intent >= 4 && scores.productFit >= 4;
}
