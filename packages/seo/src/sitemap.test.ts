import { expect, it } from "vitest";

import { buildSitemap } from "./sitemap";

it("makes absolute URLs and keeps only known dates", () => {
  expect(
    buildSitemap(
      [{ path: "/" }, { path: "/blog/a", lastModified: "2026-01-01" }],
      "https://example.com",
    ),
  ).toEqual([
    { url: "https://example.com/", lastModified: undefined },
    { url: "https://example.com/blog/a", lastModified: "2026-01-01" },
  ]);
});
