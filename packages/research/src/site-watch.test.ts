import { expect, it } from "vitest";

import {
  feedLinks,
  feedPages,
  inSection,
  normalizePrefix,
  parseFeed,
  parseSitemap,
  phraseFromPage,
  sectionLinks,
} from "./site-watch";

it("normalizes a section address", () => {
  expect(normalizePrefix("imagelayered.com/tools")).toBe(
    "https://imagelayered.com/tools/",
  );
  expect(normalizePrefix("https://WWW.LightXEditor.com/blog/ai/?x=1#y")).toBe(
    "https://www.lightxeditor.com/blog/ai/",
  );
  expect(normalizePrefix("not a site")).toBeNull();
  expect(normalizePrefix("")).toBeNull();
});

it("keeps pages below the section, not lists or feeds", () => {
  const p = "https://imagelayered.com/tools/";
  expect(
    inSection("https://imagelayered.com/tools/flova-ai-video-generator", p),
  ).toBe(true);
  expect(inSection("https://www.imagelayered.com/tools/x-y", p)).toBe(true);
  expect(inSection("https://imagelayered.com/tools/", p)).toBe(false);
  expect(inSection("https://imagelayered.com/zh/tools/x-y", p)).toBe(false);
  expect(inSection("https://imagelayered.com/tools/page/2/", p)).toBe(false);
  expect(inSection("https://imagelayered.com/tools/feed/", p)).toBe(false);
});

it("reads RSS and Atom feeds", () => {
  const rss = `<rss><channel><title>x</title><link>https://a.com/blog/ai/</link>
    <item><title><![CDATA[How to Make Goodbye GTA 5 AI Video]]></title>
    <link>https://a.com/blog/how-to-make-goodbye-gta-5-ai-video/</link>
    <pubDate>Tue, 18 Nov 2026 09:00:00 +0000</pubDate></item></channel></rss>`;
  expect(parseFeed(rss)).toEqual([
    {
      url: "https://a.com/blog/how-to-make-goodbye-gta-5-ai-video/",
      title: "How to Make Goodbye GTA 5 AI Video",
      publishedAt: new Date("2026-11-18T09:00:00Z"),
    },
  ]);
  const atom = `<feed><entry><title>Hi &amp; bye</title>
    <link rel="alternate" href="https://b.com/p/hi-bye"/>
    <updated>2026-11-10T00:00:00Z</updated></entry></feed>`;
  expect(parseFeed(atom)).toEqual([
    {
      url: "https://b.com/p/hi-bye",
      title: "Hi & bye",
      publishedAt: new Date("2026-11-10T00:00:00Z"),
    },
  ]);
  // A category's own feed lists posts that live elsewhere on the site.
  expect(
    feedPages(rss, "https://a.com/blog/ai/feed/", "https://a.com/blog/ai/"),
  ).toHaveLength(1);
  // A feed the page only announces must list pages in the section.
  expect(
    feedPages(rss, "https://a.com/feed/", "https://a.com/blog/ai/"),
  ).toHaveLength(0);
});

it("reads sitemaps, sitemap indexes, feed links and section links", () => {
  expect(
    parseSitemap(
      `<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>`,
    ),
  ).toEqual({ pages: [], children: ["https://a.com/s1.xml"] });
  expect(
    parseSitemap(
      `<urlset><url><loc>https://a.com/tools/a-b</loc><lastmod>2026-11-17</lastmod></url><url><loc>https://a.com/</loc></url></urlset>`,
    ).pages,
  ).toEqual([
    {
      url: "https://a.com/tools/a-b",
      title: null,
      publishedAt: new Date("2026-11-17"),
    },
    { url: "https://a.com/", title: null, publishedAt: null },
  ]);
  expect(
    feedLinks(
      `<link rel="alternate" type="application/rss+xml" href="/blog/ai/feed/">`,
      "https://a.com/blog/ai/",
    ),
  ).toEqual(["https://a.com/blog/ai/feed/"]);
  expect(
    sectionLinks(
      `<a href="/tools/x-y">1</a><a href="https://a.com/tools/x-y#top">2</a><a href="/about">3</a><a href="/tools/">4</a>`,
      "https://a.com/tools/",
    ).map((p) => p.url),
  ).toEqual(["https://a.com/tools/x-y"]);
});

it("turns a page into the search it targets", () => {
  const cases: [string, string | null, string | null][] = [
    [
      "https://imagelayered.com/tools/goodbye-gta-5-ai-video-generator",
      null,
      "goodbye gta 5 ai video",
    ],
    [
      "https://imagelayered.com/tools/mai-image-2.7-image-generator",
      null,
      "mai image 2.7",
    ],
    [
      "https://www.lightxeditor.com/blog/how-to-make-goodbye-gta-5-ai-video/",
      null,
      "goodbye gta 5 ai video",
    ],
    [
      "https://www.piclumen.com/apps/effects-gta-5-inspired-goodbye-scene/",
      null,
      "gta 5 inspired goodbye scene",
    ],
    [
      "https://www.jif.dev/blog/ai-gta-diner-farewell-video",
      null,
      "ai gta diner farewell video",
    ],
    [
      "https://a.com/p/12345",
      "Seaart AI Video Generator | A.com",
      "seaart ai video",
    ],
    ["https://a.com/tools/flova-ai-video-a1b2c3d4", null, "flova ai video"],
    ["https://a.com/p/12345", null, null],
  ];
  for (const [url, title, want] of cases)
    expect(phraseFromPage(url, title), url).toBe(want);
});
