import type { Metadata, ResolvingMetadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { CREDIT_PACKS } from "@repo/billing/credit-packs";
import { lowestPerUseCents } from "@repo/billing/pack-pricing";
import { SUBSCRIPTION_PLANS } from "@repo/billing/subscription-plans";

import { TrackView } from "@/components/analytics/track";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { SiteFooter } from "@/components/landing/site-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { formatUsd } from "@/lib/format-usd";
import { getSession } from "@/server/auth/auth";
import { CREDIT_COST_PER_USE } from "@/server/product";

export async function generateMetadata(
  _: PageProps<"/pricing">,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const t = await getTranslations("pricing");
  const title = t("eyebrow");
  // Prices come from CREDIT_PACKS so the snippet never shows a stale price.
  const description = t("metaDescription", {
    singlePrice: formatUsd(CREDIT_PACKS.single.priceUsd),
    lowestPrice: formatUsd(lowestPerUseCents(CREDIT_COST_PER_USE)),
    planPrice: formatUsd(SUBSCRIPTION_PLANS.monthly.priceUsd),
  });
  return {
    title,
    description,
    alternates: { canonical: "/pricing" },
    // A page-level openGraph replaces the layout's, so keep its image, type and locale.
    openGraph: {
      ...(await parent).openGraph,
      title,
      description,
      url: "/pricing",
    },
  };
}

export default async function PricingPage() {
  const session = await getSession(await headers());
  const t = await getTranslations("pricing");
  const signedIn = Boolean(session);
  return (
    <>
      <TrackView event="pricing_viewed" />
      <MarketingNav current="pricing" signedIn={signedIn} />
      <main className="mx-auto flex w-full max-w-360 flex-col items-center gap-10 px-5 pt-12 pb-16 md:gap-14 md:px-30 md:pt-18 md:pb-24">
        <header className="max-w-190 space-y-3.5 text-center">
          <p className="text-xs font-bold tracking-[1px] text-brand-text uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight md:text-[52px]">
            {t("title")}
          </h1>
          <p className="text-[17px] text-muted-foreground">{t("subtitle")}</p>
        </header>
        <PricingPlans signedIn={signedIn} heading="h2" />
        <p className="text-center text-[13px] text-subtle-foreground">
          {t("finePrint")}
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
