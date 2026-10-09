import {
  CREDIT_PACK_IDS,
  CREDIT_PACKS,
  type CreditPackId,
} from "./credit-packs";
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanId,
} from "./subscription-plans";

// Display figures for a pack (docs/architecture/billing.md#credit-packs). `creditCost`
// is the credits one use costs. The saving is rounded down so the page never claims
// more than the real discount.
export function packPricing(packId: CreditPackId, creditCost: number) {
  const pricing = figures(CREDIT_PACKS[packId], creditCost);
  return {
    ...pricing,
    savingPercent: packId === "single" ? null : pricing.savingPercent,
  };
}

/** The same figures for one period of a subscription plan. */
export function planPricing(planId: SubscriptionPlanId, creditCost: number) {
  return figures(SUBSCRIPTION_PLANS[planId], creditCost);
}

function figures(
  item: { credits: number; priceUsd: number },
  creditCost: number,
) {
  const uses = Math.floor(item.credits / creditCost);
  const exact = item.priceUsd / uses;
  const single =
    CREDIT_PACKS.single.priceUsd /
    Math.floor(CREDIT_PACKS.single.credits / creditCost);
  return {
    uses,
    perUseCents: Math.round(exact),
    savingPercent: Math.floor((1 - exact / single) * 100),
  };
}

// The "as low as" per-use price across all packs.
export function lowestPerUseCents(creditCost: number) {
  return Math.min(
    ...CREDIT_PACK_IDS.map((id) => packPricing(id, creditCost).perUseCents),
  );
}
