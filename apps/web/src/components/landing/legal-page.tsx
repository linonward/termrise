import type { Metadata } from "next";
import { headers } from "next/headers";
import { getMessages, getTranslations } from "next-intl/server";

import { MarketingNav } from "@/components/marketing/marketing-nav";
import { getSession } from "@/server/auth/auth";

import { SiteFooter } from "./site-footer";

type LegalPageId = "terms" | "privacy" | "refund";

const legalPaths: Record<LegalPageId, string> = {
  terms: "/terms",
  privacy: "/privacy",
  refund: "/refund-policy",
};

export async function legalMetadata(page: LegalPageId): Promise<Metadata> {
  const t = await getTranslations("legal");
  return {
    title: t(`${page}.title`),
    description: t(`${page}.description`),
    alternates: { canonical: legalPaths[page] },
  };
}

// Static legal pages; copy lives in messages under `legal.{page}`.
export async function LegalPage({ page }: { page: LegalPageId }) {
  const t = await getTranslations("legal");
  const sections = Object.entries((await getMessages()).legal[page].sections);
  return (
    <>
      <MarketingNav signedIn={Boolean(await getSession(await headers()))} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-12 px-5 py-12 md:py-16">
        <header className="space-y-3">
          <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
            {t(`${page}.title`)}
          </h1>
          <p className="text-[13px] text-muted-foreground">{t("updated")}</p>
        </header>
        {sections.map(([key, section]) => (
          <section key={key} aria-labelledby={key} className="space-y-3">
            <h2
              id={key}
              className="font-heading text-xl font-semibold tracking-tight md:text-2xl"
            >
              {section.title}
            </h2>
            {section.body.map((paragraph, index) => (
              <p key={index} className="text-[15px] text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
