import type { MetadataRoute } from "next";

import { serverEnv } from "@repo/config/env";
import { buildSitemap, type SitemapPage } from "@repo/seo/sitemap";

import { BLOG_POSTS, BLOG_SLUGS } from "@/components/blog/posts";
import product from "@product";

// APP_URL is read per request: it differs per deployment and is not set at build time.
export const dynamic = "force-dynamic";

// lastmod only where the date is known: the post's updated date, and for /blog
// the newest post. A wrong lastmod is worse than none, so other pages have none.
const PUBLIC_PAGES: SitemapPage[] = [
  { path: "/" },
  // Pricing and the refund rules are hidden while the product does not charge.
  ...(product.billingEnabled ? [{ path: "/pricing" }] : []),
  { path: "/blog", lastModified: BLOG_POSTS[BLOG_SLUGS[0]!].updated },
  ...BLOG_SLUGS.map((slug) => ({
    path: `/blog/${slug}`,
    lastModified: BLOG_POSTS[slug].updated,
  })),
  { path: "/terms" },
  { path: "/privacy" },
  ...(product.billingEnabled ? [{ path: "/refund-policy" }] : []),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = serverEnv().APP_URL;
  return buildSitemap(PUBLIC_PAGES, base);
}
