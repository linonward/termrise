import { getTranslations } from "next-intl/server";

import { CREDIT_PACK_IDS, CREDIT_PACKS } from "@repo/billing/credit-packs";
import { serverEnv } from "@repo/config/env";
import { jsonLdHtml, siteGraph } from "@repo/seo/structured-data";

import product from "@product";

// Home page JSON-LD (docs/product/ux.md#seo); prices from CREDIT_PACKS, none while the
// product does not charge.
export async function SiteStructuredData() {
  const t = await getTranslations("meta");
  const data = siteGraph({
    url: new URL("/", serverEnv().APP_URL).href,
    name: t("title"),
    description: t("description"),
    pricesCents: product.billingEnabled
      ? CREDIT_PACK_IDS.map((id) => CREDIT_PACKS[id].priceUsd)
      : [],
  });
  return <JsonLd data={data} />;
}

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}
