// DeepSeek prices in USD per 1M tokens, from https://api-docs.deepseek.com/quick_start/pricing
// (checked 2026-10-10). That page gives peak and off-peak prices; peak hours exclude Chinese
// public holidays, which this code cannot know. So every call is charged at the peak
// price: the budget may count more than DeepSeek bills, never less. Update the table
// when the page changes; a model not in it cannot be used.
export const DEEPSEEK_PRICES = {
  "deepseek-flash": { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
  "deepseek-v4-pro": { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
} as const;

export type DeepSeekModel = keyof typeof DEEPSEEK_PRICES;

export const isDeepSeekModel = (model: string): model is DeepSeekModel =>
  Object.hasOwn(DEEPSEEK_PRICES, model);

/**
 * Cost in micro-USD, rounded up. A price per 1M tokens in USD is the price per token in
 * micro-USD, so the cost is tokens × price.
 */
export function deepSeekCostMicros(
  model: DeepSeekModel,
  tokens: {
    cacheHitTokens: number;
    cacheMissTokens: number;
    outputTokens: number;
  },
) {
  const price = DEEPSEEK_PRICES[model];
  return Math.ceil(
    tokens.cacheHitTokens * price.cacheHit +
      tokens.cacheMissTokens * price.cacheMiss +
      tokens.outputTokens * price.output,
  );
}
