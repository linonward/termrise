// The only source of pack prices: docs/architecture/billing.md#credit-packs.
// Placeholder prices: set your own. Single is the per-use reference price; packs show their saving against it.
export const CREDIT_PACKS = {
  single: { credits: 10, priceUsd: 590 },
  starter: { credits: 50, priceUsd: 1990 },
  creator: { credits: 150, priceUsd: 4990 },
  pro: { credits: 280, priceUsd: 7990 },
} as const;

export type CreditPackId = keyof typeof CREDIT_PACKS;

export const CREDIT_PACK_IDS = Object.keys(CREDIT_PACKS) as [
  CreditPackId,
  ...CreditPackId[],
];
