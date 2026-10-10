import { expect, it } from "vitest";

import { jsonLdHtml, siteGraph } from "./structured-data";

it("describes the organization, site and app with the price range", () => {
  const graph = siteGraph({
    url: "https://example.com/",
    name: "Acme",
    description: "A tool.",
    pricesCents: [590, 7990, 1990],
  })["@graph"];
  expect(graph[0]).toMatchObject({
    "@type": "Organization",
    logo: "https://example.com/apple-icon.png",
  });
  expect(graph[2]).toMatchObject({
    "@type": "SoftwareApplication",
    applicationCategory: "BusinessApplication",
    offers: { lowPrice: "5.90", highPrice: "79.90", offerCount: 3 },
  });
  expect(JSON.stringify(graph)).not.toContain("aggregateRating");
});

it("leaves out offers when there are no prices", () => {
  const graph = siteGraph({
    url: "https://example.com/",
    name: "Acme",
    description: "A tool.",
    pricesCents: [],
  })["@graph"];
  expect(graph[2]).not.toHaveProperty("offers");
});

it("escapes < so the JSON cannot close the script tag", () => {
  expect(jsonLdHtml({ name: "</script><b>" })).toBe(
    '{"name":"\\u003c/script>\\u003cb>"}',
  );
});
