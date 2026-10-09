import { ChevronRight } from "lucide-react";
import type { Metadata, ResolvingMetadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getMessages, getTranslations } from "next-intl/server";

import { serverEnv } from "@repo/config/env";

import {
  BLOG_POSTS,
  BLOG_SLUGS,
  isBlogSlug,
  splitLink,
  type BlogPost,
} from "@/components/blog/posts";
import { FinalCta } from "@/components/landing/sections";
import { SiteFooter } from "@/components/landing/site-footer";
import { JsonLd } from "@/components/landing/structured-data";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { getSession } from "@/server/auth/auth";

export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: PageProps<"/blog/[slug]">,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  if (!isBlogSlug(slug)) return {};
  const post = BLOG_POSTS[slug];
  const t = await getTranslations(`blog.posts.${post.key}.meta`);
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    // A page-level openGraph replaces the layout's, so keep its image and locale.
    openGraph: {
      ...(await parent).openGraph,
      type: "article",
      publishedTime: post.published,
      modifiedTime: post.updated,
      title,
      description,
      url: `/blog/${slug}`,
    },
  };
}

const bodyText = "text-[15px] text-muted-foreground";

// Blog post (docs/product/ux.md#blog-pages).
// Sections render in messages order, like the legal pages.
export default async function BlogPostPage({
  params,
}: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  if (!isBlogSlug(slug)) notFound();
  const post = BLOG_POSTS[slug];
  const t = await getTranslations(`blog.posts.${post.key}`);
  const blog = await getTranslations("blog");
  const format = await getFormatter();
  const messages = await getMessages();
  const copy = messages.blog.posts[post.key];
  const sections = Object.entries(copy.sections);
  const signedIn = Boolean(await getSession(await headers()));
  // Signed-in readers go straight to the dashboard; others sign up first.
  const createHref = signedIn ? "/dashboard" : "/sign-up";

  const base = serverEnv().APP_URL;
  const url = new URL(`/blog/${slug}`, base).href;
  const site = new URL("/", base).href;
  const brand = (await getTranslations("meta"))("title");
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: t("title"),
        description: t("meta.description"),
        datePublished: post.published,
        dateModified: post.updated,
        image: new URL("/opengraph-image", base).href,
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: brand, url: site },
        publisher: { "@type": "Organization", name: brand, url: site },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: blog("home"),
            item: new URL("/blog", base).href,
          },
          { "@type": "ListItem", position: 2, name: t("title"), item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <MarketingNav current="blog" signedIn={signedIn} />
      <main className="flex-1">
        <article className="mx-auto w-full max-w-180 space-y-8 px-5 pt-8 pb-12 md:space-y-12 md:pt-16 md:pb-24">
          <header className="space-y-4">
            <nav aria-label={blog("breadcrumb")}>
              <ol className="flex items-center gap-2 text-[13px] font-medium">
                <li>
                  <Link href="/blog" className="text-brand-text">
                    {blog("home")}
                  </Link>
                </li>
                <li aria-hidden="true">
                  <ChevronRight className="size-3.5 text-subtle-foreground" />
                </li>
                <li aria-current="page" className="text-muted-foreground">
                  {t("title")}
                </li>
              </ol>
            </nav>
            <h1 className="font-heading text-[28px] leading-[1.15] font-bold tracking-tight md:text-4xl">
              {t("title")}
            </h1>
            <p className="text-[15px] text-muted-foreground md:text-lg">
              {t("summary")}
            </p>
            <p className="text-[13px] font-medium text-subtle-foreground">
              {blog("updated", {
                date: format.dateTime(new Date(post.updated), {
                  dateStyle: "long",
                  timeZone: "UTC",
                }),
              })}
            </p>
          </header>

          {sections.map(([key, section]) => (
            <section key={key} aria-labelledby={key} className="space-y-3">
              <h2
                id={key}
                className="font-heading text-xl font-semibold tracking-tight md:text-2xl"
              >
                {section.title}
              </h2>
              {"body" in section &&
                section.body.map((paragraph, index) => (
                  <p key={index} className={bodyText}>
                    <BodyText text={paragraph} href={post.target} />
                  </p>
                ))}
              {"steps" in section && (
                <ol className="space-y-3 pt-1">
                  {section.steps.map((step, index) => (
                    <li key={index} className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-text">
                        {index + 1}
                      </span>
                      <span className={bodyText}>
                        <BodyText text={step} href={post.target} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {"list" in section && (
                <ul className="space-y-3 pt-1">
                  {section.list.map((item, index) => (
                    <li key={index} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-6 shrink-0 items-center justify-center"
                      >
                        <span className="size-1.5 rounded-full bg-brand-text" />
                      </span>
                      <span className={bodyText}>
                        <BodyText text={item} href={post.target} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Keep reading: hand-picked posts. */}
          <section aria-labelledby="related" className="space-y-4">
            <h2
              id="related"
              className="font-heading text-xl font-semibold tracking-tight md:text-2xl"
            >
              {blog("related")}
            </h2>
            <ul className="border-t border-border">
              {post.related.filter(isBlogSlug).map((relatedSlug) => {
                const related = BLOG_POSTS[relatedSlug];
                return (
                  <li
                    key={relatedSlug}
                    className="flex items-center gap-4 border-b border-border py-4 md:items-start md:gap-5 md:py-5"
                  >
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold">
                        <Link
                          href={`/blog/${relatedSlug}`}
                          className="hover:text-brand-text"
                        >
                          {blog(`posts.${related.key}.title`)}
                        </Link>
                      </h3>
                      <p className="hidden text-[15px] text-muted-foreground md:block">
                        {blog(`posts.${related.key}.summary`)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </article>

        <FinalCta
          title={t("finalCta")}
          body={(await getTranslations("landing"))("finalCta.body")}
          cta={t("cta")}
          href={createHref}
        />
      </main>
      <SiteFooter />
    </>
  );
}

// Body copy with an optional <link>…</link> to the post's conversion page.
function BodyText({ text, href }: { text: string; href: BlogPost["target"] }) {
  const parts = splitLink(text);
  if (!parts) return text;
  return (
    <>
      {parts.before}
      <Link
        href={href}
        className="font-medium text-foreground underline underline-offset-4"
      >
        {parts.link}
      </Link>
      {parts.after}
    </>
  );
}
