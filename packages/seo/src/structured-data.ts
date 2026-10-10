// JSON-LD for the home page (docs/product/ux.md#seo). Only facts visible on the
// page: no ratings or reviews.
export type SiteGraphInput = {
  /** Absolute home page URL, ending in "/". */
  url: string;
  name: string;
  description: string;
  /** Pack prices in US cents; empty: no offers. */
  pricesCents: number[];
  applicationCategory?: string;
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

export function siteGraph({
  url,
  name,
  description,
  pricesCents,
  applicationCategory = "BusinessApplication",
}: SiteGraphInput) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${url}#organization`,
        name,
        url,
        logo: new URL("/apple-icon.png", url).href,
      },
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name,
        url,
        publisher: { "@id": `${url}#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name,
        url,
        description,
        applicationCategory,
        operatingSystem: "Web",
        ...(pricesCents.length > 0 && {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            lowPrice: dollars(Math.min(...pricesCents)),
            highPrice: dollars(Math.max(...pricesCents)),
            offerCount: pricesCents.length,
          },
        }),
        publisher: { "@id": `${url}#organization` },
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json">; "<" is escaped so text can never close the tag. */
export function jsonLdHtml(data: object) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
