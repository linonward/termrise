// Keeps the Waffo one-time products in line with CREDIT_PACKS, and the subscription
// products in line with SUBSCRIPTION_PLANS
// (docs/architecture/billing.md#credit-packs). Uses the Waffo key in .env.local; the
// key decides test or production (docs/runbook.md#change-prices).
//   pnpm waffo:products                    print the planned name and price of every product
//   pnpm waffo:products --apply            update existing products, create missing ones
//   pnpm waffo:products --publish <pack…>  first publish of new products to production
// Waffo allows only one publish per product; later price changes are --apply with the
// production key. New product ids are printed; add them to WAFFO_PRODUCT_IDS or
// WAFFO_SUBSCRIPTION_PRODUCT_IDS. --publish takes pack and plan ids.
import { existsSync } from "node:fs";

import { BillingPeriod, TaxCategory, WaffoPancake } from "@waffo/pancake-ts";

import {
  WAFFO_PRODUCT_IDS,
  WAFFO_SUBSCRIPTION_PRODUCT_IDS,
} from "@repo/billing/adapters/waffo";
import {
  CREDIT_PACK_IDS,
  CREDIT_PACKS,
  type CreditPackId,
} from "@repo/billing/credit-packs";
import {
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanId,
} from "@repo/billing/subscription-plans";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const NAMES: Record<CreditPackId, string> = {
  single: "Single",
  starter: "Starter",
  creator: "Creator",
  pro: "Pro",
};

const plan = (packId: CreditPackId) => {
  const pack = CREDIT_PACKS[packId];
  return {
    name: `${NAMES[packId]} — ${pack.credits} credits`,
    prices: {
      USD: {
        amount: (pack.priceUsd / 100).toFixed(2),
        taxCategory: TaxCategory.SaaS,
      },
    },
    metadata: { packId },
  };
};

const PLAN_NAMES: Record<SubscriptionPlanId, string> = { monthly: "Monthly" };

const subscription = (planId: SubscriptionPlanId) => {
  const plan = SUBSCRIPTION_PLANS[planId];
  return {
    name: `${PLAN_NAMES[planId]} — ${plan.credits} credits a month`,
    billingPeriod: plan.billingPeriod as BillingPeriod,
    prices: {
      USD: {
        amount: (plan.priceUsd / 100).toFixed(2),
        taxCategory: TaxCategory.SaaS,
      },
    },
    metadata: { planId },
  };
};

async function main() {
  const mode = process.argv[2];
  const merchantId = env("WAFFO_MERCHANT_ID");
  const client = new WaffoPancake({
    merchantId,
    privateKey: env("WAFFO_PRIVATE_KEY"),
  });
  const only = process.argv.slice(3);
  if (mode === "--publish" && !only.length)
    throw new Error("--publish needs the pack or plan ids to publish");
  for (const packId of CREDIT_PACK_IDS) {
    if (only.length && !only.includes(packId)) continue;
    const id = WAFFO_PRODUCT_IDS[packId] || undefined;
    const product = plan(packId);
    const label = `${packId} ${id ?? "(new)"} ${product.name} $${product.prices.USD.amount}`;
    if (mode === "--apply") {
      const result = id
        ? await client.onetimeProducts.update({ id, ...product })
        : await client.onetimeProducts.create(
            { storeId: env("WAFFO_STORE_ID"), ...product },
            {
              idempotencyKey: [
                merchantId,
                "app-product",
                packId,
                CREDIT_PACKS[packId].priceUsd,
              ].join("-"),
            },
          );
      console.log(`${label} → ${result.product.id}`, result.warnings ?? "");
    } else if (mode === "--publish") {
      if (!id) throw new Error(`${packId} has no product id yet`);
      const result = await client.onetimeProducts.publish({ id });
      console.log(`${label} → published`, result.warnings ?? "");
    } else {
      console.log(label);
    }
  }
  for (const planId of SUBSCRIPTION_PLAN_IDS) {
    if (only.length && !only.includes(planId)) continue;
    const id = WAFFO_SUBSCRIPTION_PRODUCT_IDS[planId] || undefined;
    const product = subscription(planId);
    const label = `${planId} ${id ?? "(new)"} ${product.name} $${product.prices.USD.amount}/${product.billingPeriod}`;
    if (mode === "--apply") {
      const result = id
        ? await client.subscriptionProducts.update({ id, ...product })
        : await client.subscriptionProducts.create(
            { storeId: env("WAFFO_STORE_ID"), ...product },
            {
              idempotencyKey: [
                merchantId,
                "app-subscription",
                planId,
                SUBSCRIPTION_PLANS[planId].priceUsd,
              ].join("-"),
            },
          );
      console.log(`${label} → ${result.product.id}`, result.warnings ?? "");
    } else if (mode === "--publish") {
      if (!id) throw new Error(`${planId} has no product id yet`);
      const result = await client.subscriptionProducts.publish({ id });
      console.log(`${label} → published`, result.warnings ?? "");
    } else {
      console.log(label);
    }
  }
}

void main();
