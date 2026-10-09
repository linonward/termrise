import { ArrowDown, Coins, Globe, RotateCcw, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { serverEnv } from "@repo/config/env";

import { TrackView } from "@/components/analytics/track";
import { GoogleOneTap } from "@/components/auth/google-one-tap";
import { PricingPlans } from "@/components/billing/pricing-plans";
import {
  CreateButton,
  Eyebrow,
  FaqItem,
  FaqSection,
  FinalCta,
  HowItWorks,
  IconListSection,
  SectionTitle,
} from "@/components/landing/sections";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteStructuredData } from "@/components/landing/structured-data";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { getSession } from "@/server/auth/auth";

const features = [
  { key: "credits", icon: Coins },
  { key: "refunds", icon: RotateCcw },
  { key: "privacy", icon: ShieldCheck },
  { key: "languages", icon: Globe },
] as const;

const faqs = ["start", "credits", "failed", "expire", "refund"] as const;

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const t = await getTranslations("landing");
  const pricing = await getTranslations("pricing");
  const env = serverEnv();
  const signedIn = Boolean(await getSession(await headers()));
  return (
    <>
      <TrackView event="landing_viewed" />
      <SiteStructuredData />
      <MarketingNav signedIn={signedIn} />
      {!signedIn && (
        <GoogleOneTap
          clientId={env.GOOGLE_CLIENT_ID}
          callbackURL="/dashboard"
          deferUntilInteraction
        />
      )}
      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-310 items-center gap-12 px-5 py-12 md:grid-cols-2 md:py-16 lg:grid-cols-[7fr_5fr]">
          <div className="space-y-6">
            <Eyebrow>{t("hero.eyebrow")}</Eyebrow>
            <h1 className="font-heading text-4xl font-bold tracking-tight md:text-[56px] md:leading-[1.1] md:tracking-[-1.6px]">
              {t.rich("hero.title", {
                line: (chunks) => <span className="block">{chunks}</span>,
              })}
            </h1>
            <p className="max-w-md text-[15px] text-muted-foreground">
              {t("hero.body")}
            </p>
            <CreateButton label={t("hero.cta")} />
            <p className="text-xs text-subtle-foreground">{t("hero.note")}</p>
          </div>
          {/* Replace with the product's own screenshot or demo. */}
          <div className="flex flex-col items-center gap-4 rounded-lg bg-surface p-8 md:p-12">
            <p className="w-full max-w-[320px] rounded-md border border-border bg-background px-4 py-3 text-[15px]">
              {t("demo.input")}
            </p>
            <ArrowDown
              aria-hidden="true"
              className="size-5 text-subtle-foreground"
            />
            <p className="w-full max-w-[320px] rounded-md border border-border bg-background px-4 py-3 text-[15px] font-medium">
              {t("demo.output")}
            </p>
          </div>
        </section>

        <HowItWorks />

        <IconListSection
          id="features-title"
          eyebrow={t("features.eyebrow")}
          title={t("features.title")}
          items={features.map(({ key, icon }) => ({
            key,
            icon,
            title: t(`features.${key}.title`),
            body: t(`features.${key}.body`),
          }))}
        />

        <section
          id="pricing"
          aria-labelledby="pricing-title"
          className="scroll-mt-16 bg-surface"
        >
          <div className="mx-auto flex w-full max-w-310 flex-col items-center gap-8 px-5 py-16">
            <div className="space-y-3 text-center">
              <Eyebrow>{pricing("eyebrow")}</Eyebrow>
              <SectionTitle id="pricing-title">{pricing("title")}</SectionTitle>
              <p className="text-[15px] text-muted-foreground">
                {pricing("subtitle")}
              </p>
            </div>
            <PricingPlans signedIn={signedIn} heading="h3" />
          </div>
        </section>

        <FaqSection eyebrow={t("faq.eyebrow")} title={t("faq.title")}>
          {faqs.map((key) => (
            <FaqItem key={key} question={t(`faq.${key}.q`)}>
              {t.rich(`faq.${key}.a`, {
                link: (chunks) => (
                  <Link
                    href="/refund-policy"
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </FaqItem>
          ))}
        </FaqSection>

        <FinalCta
          title={t("finalCta.title")}
          body={t("finalCta.body")}
          cta={t("hero.cta")}
        />
      </main>
      <SiteFooter />
    </>
  );
}
