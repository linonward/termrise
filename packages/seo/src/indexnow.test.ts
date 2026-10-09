import { describe, expect, it } from "vitest";

import { buildPayload, sitemapUrls } from "./indexnow";

const KEY = "0123456789abcdef0123456789abcdef";

describe("sitemapUrls", () => {
  it("returns every <loc> in order", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.com/</loc></url>
<url><loc>https://example.com/pricing</loc></url>
</urlset>`;
    expect(sitemapUrls(xml)).toEqual([
      "https://example.com/",
      "https://example.com/pricing",
    ]);
  });

  it("decodes XML entities", () => {
    expect(sitemapUrls("<loc>https://example.com/a?b=1&amp;c=2</loc>")).toEqual(
      ["https://example.com/a?b=1&c=2"],
    );
  });
});

describe("buildPayload", () => {
  it("uses the host of the URLs and the hosted key file", () => {
    expect(
      buildPayload(["https://example.com/", "https://example.com/blog"], KEY),
    ).toEqual({
      host: "example.com",
      key: KEY,
      keyLocation: `https://example.com/${KEY}.txt`,
      urlList: ["https://example.com/", "https://example.com/blog"],
    });
  });

  it("rejects an empty list", () => {
    expect(() => buildPayload([], KEY)).toThrow("No URLs");
  });

  it("rejects URLs from more than one host", () => {
    expect(() =>
      buildPayload(["https://example.com/", "https://example.org/"], KEY),
    ).toThrow("one host");
  });
});
