// Sitemap entries from public paths (docs/product/ux.md#seo). Give lastModified
// only when the date is known: a wrong lastmod is worse than none.
export type SitemapPage = { path: string; lastModified?: string };

export function buildSitemap(pages: SitemapPage[], baseUrl: string) {
  return pages.map(({ path, lastModified }) => ({
    url: new URL(path, baseUrl).href,
    lastModified,
  }));
}
