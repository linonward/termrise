// The only source of subscription prices: docs/architecture/billing.md#subscription-plans.
// Placeholder price and credits: set your own (docs/product/product.md#unit-economics).
export const SUBSCRIPTION_PLANS = {
  monthly: { credits: 60, priceUsd: 990, billingPeriod: "monthly" },
} as const;

export type SubscriptionPlanId = keyof typeof SUBSCRIPTION_PLANS;

export const SUBSCRIPTION_PLAN_IDS = Object.keys(SUBSCRIPTION_PLANS) as [
  SubscriptionPlanId,
  ...SubscriptionPlanId[],
];
