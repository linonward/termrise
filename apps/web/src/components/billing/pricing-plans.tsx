import {
  Coins,
  Gift,
  Infinity as InfinityIcon,
  Play,
  RotateCcw,
  Tag,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CREDIT_PACK_IDS, CREDIT_PACKS } from "@repo/billing/credit-packs";
import { packPricing, planPricing } from "@repo/billing/pack-pricing";
import {
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_PLANS,
} from "@repo/billing/subscription-plans";
import { cn } from "@repo/ui/utils";

import { BuyButton } from "@/components/billing/buy-button";
import { formatUsd } from "@/lib/format-usd";
import { CREDIT_COST_PER_USE } from "@/server/product";

const FEATURED = "creator";

// Pack cards + subscription plans + credit facts, shared by /pricing and the landing
// Pricing section.
export async function PricingPlans({
  signedIn,
  heading: Heading,
}: {
  signedIn: boolean;
  heading: "h2" | "h3";
}) {
  const t = await getTranslations("pricing");
  const facts = [
    [Play, "task", t("credits", { count: CREDIT_COST_PER_USE })],
    [RotateCcw, "failed", t("refunded")],
    [Gift, "newAccount", t("freeCredits")],
  ] as const;
  return (
    <>
      <ul className="grid w-full max-w-300 gap-6 md:grid-cols-2 md:items-center xl:grid-cols-4">
        {CREDIT_PACK_IDS.map((packId) => {
          const pack = CREDIT_PACKS[packId];
          const { uses, perUseCents, savingPercent } = packPricing(
            packId,
            CREDIT_COST_PER_USE,
          );
          const featured = packId === FEATURED;
          return (
            <li
              key={packId}
              data-testid={`pack-${packId}`}
              className={cn(
                "flex flex-col gap-5 rounded-lg bg-background",
                featured
                  ? "border-2 border-primary p-8"
                  : "border border-border p-7",
              )}
            >
              <div className="flex items-center justify-between">
                <Heading className="text-base font-semibold">
                  {t(`pack.${packId}`)}
                </Heading>
                {featured && (
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-text">
                    {t("mostPopular")}
                  </span>
                )}
              </div>
              <p className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-heading text-[44px] font-bold tabular-nums">
                  {formatUsd(pack.priceUsd)}
                </span>
                <span className="text-sm whitespace-nowrap text-muted-foreground">
                  {t("oneTime")}
                </span>
              </p>
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-center gap-2.5">
                  <Play
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  {t("uses", { count: uses })}
                </li>
                <li className="flex items-center gap-2.5">
                  <Coins
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  {t("credits", { count: pack.credits })}
                </li>
                <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Tag
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  <span className="font-semibold whitespace-nowrap">
                    {t("perUse", { price: formatUsd(perUseCents) })}
                  </span>
                  {savingPercent !== null && (
                    <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-success">
                      {t("save", { percent: savingPercent })}
                    </span>
                  )}
                </li>
                <li className="flex items-center gap-2.5">
                  <InfinityIcon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  {t("neverExpire")}
                </li>
              </ul>
              <BuyButton
                item={{ packId }}
                signedIn={signedIn}
                featured={featured}
              />
            </li>
          );
        })}
      </ul>
      <ul className="w-full max-w-300 space-y-6">
        {SUBSCRIPTION_PLAN_IDS.map((planId) => {
          const plan = SUBSCRIPTION_PLANS[planId];
          const { uses, perUseCents, savingPercent } = planPricing(
            planId,
            CREDIT_COST_PER_USE,
          );
          return (
            <li
              key={planId}
              data-testid={`plan-${planId}`}
              className="flex flex-col gap-5 rounded-lg border border-border bg-background p-7 md:flex-row md:items-center md:gap-10"
            >
              <div className="space-y-2 md:w-60">
                <div className="flex items-center gap-2.5">
                  <Heading className="text-base font-semibold">
                    {t(`plan.${planId}`)}
                  </Heading>
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-text">
                    {t("subscription")}
                  </span>
                </div>
                <p className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-heading text-[44px] font-bold tabular-nums">
                    {formatUsd(plan.priceUsd)}
                  </span>
                  <span className="text-sm whitespace-nowrap text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </p>
              </div>
              <ul className="grid flex-1 gap-2.5 text-sm sm:grid-cols-2">
                <li className="flex items-center gap-2.5">
                  <Coins
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  {t("creditsPerMonth", { count: plan.credits })}
                </li>
                <li className="flex items-center gap-2.5">
                  <Play
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  {t("uses", { count: uses })}
                </li>
                <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Tag
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  <span className="font-semibold whitespace-nowrap">
                    {t("perUse", { price: formatUsd(perUseCents) })}
                  </span>
                  <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-success">
                    {t("save", { percent: savingPercent })}
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <InfinityIcon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  {t("neverExpire")}
                </li>
              </ul>
              <div className="md:w-56">
                <BuyButton
                  item={{ planId }}
                  signedIn={signedIn}
                  featured={false}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <ul className="grid w-full max-w-300 gap-6 rounded-lg bg-surface px-8 py-7 sm:grid-cols-2 md:grid-cols-3">
        {facts.map(([Icon, label, value]) => (
          <li key={label} className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-background">
              <Icon aria-hidden="true" className="size-4.5" />
            </span>
            <span className="space-y-0.5">
              <span className="block text-[13px] text-muted-foreground">
                {t(label)}
              </span>
              <span className="block text-[15px] font-semibold">{value}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
