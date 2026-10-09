import { ArrowRight } from "lucide-react";
import type { Metadata, ResolvingMetadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { BLOG_POSTS, BLOG_SLUGS } from "@/components/blog/posts";
import { Eyebrow, FinalCta } from "@/components/landing/sections";
import { SiteFooter } from "@/components/landing/site-footer";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { getSession } from "@/server/auth/auth";

export async function generateMetadata(
  _: PageProps<"/blog">,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const t = await getTranslations("blog.meta");
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    alternates: { canonical: "/blog" },
    // A page-level openGraph replaces the layout's, so keep its image, type and locale.
    openGraph: {
      ...(await parent).openGraph,
      title,
      description,
      url: "/blog",
    },
  };
}

// Blog index (docs/product/ux.md#blog-pages).
export default async function BlogPage() {
  const t = await getTranslations("blog");
  const landing = await getTranslations("landing");
  const format = await getFormatter();
  const signedIn = Boolean(await getSession(await headers()));
  return (
    <>
      <MarketingNav current="blog" signedIn={signedIn} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-180 space-y-12 px-5 pt-8 pb-12 md:pt-16 md:pb-24">
          <header className="space-y-4">
            <Eyebrow>{t("index.eyebrow")}</Eyebrow>
            <h1 className="font-heading text-[28px] leading-[1.15] font-bold tracking-tight md:text-4xl">
              {t("index.title")}
            </h1>
            <p className="text-[15px] text-muted-foreground md:text-lg">
              {t("index.intro")}
            </p>
          </header>
          <ul className="border-t border-border">
            {BLOG_SLUGS.map((slug) => {
              const post = BLOG_POSTS[slug];
              const href = `/blog/${slug}`;
              return (
                <li
                  key={slug}
                  className="flex gap-6 border-b border-border py-6"
                >
                  <div className="space-y-2">
                    <p className="text-[13px] font-medium text-subtle-foreground">
                      {t("updated", {
                        date: format.dateTime(new Date(post.updated), {
                          dateStyle: "long",
                          timeZone: "UTC",
                        }),
                      })}
                    </p>
                    <h2 className="text-lg font-semibold">
                      <Link href={href} className="hover:text-brand-text">
                        {t(`posts.${post.key}.title`)}
                      </Link>
                    </h2>
                    <p className="text-[15px] text-muted-foreground">
                      {t(`posts.${post.key}.summary`)}
                    </p>
                    <Link
                      href={href}
                      aria-hidden="true"
                      tabIndex={-1}
                      className="inline-flex items-center gap-1.5 pt-1 text-[13px] font-semibold text-brand-text"
                    >
                      {t("index.read")}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <FinalCta
          title={landing("finalCta.title")}
          body={landing("finalCta.body")}
          cta={landing("hero.cta")}
          href={signedIn ? "/dashboard" : "/sign-up"}
        />
      </main>
      <SiteFooter />
    </>
  );
}
