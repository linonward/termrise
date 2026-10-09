// Notify Bing and other IndexNow search engines about new or changed pages
// (ChatGPT search uses the Bing index). See docs/product/ux.md#seo.
// Run after the change is live on Production:
//   pnpm indexnow                     every URL in the production sitemap.xml
//   pnpm indexnow <url> [<url>…]      only these URLs
import { pathToFileURL } from "node:url";

import {
  buildPayload,
  INDEXNOW_ENDPOINT,
  sitemapUrls,
} from "@repo/seo/indexnow";

import product from "@product";

// IndexNow keys are public: the engines verify ownership by fetching
// public/<key>.txt from the same host.
export const INDEXNOW_KEY = "241ec6da15709493e127e05b045e508f";

const SITEMAP_URL = `https://${product.domain}/sitemap.xml`;

async function main() {
  let urls = process.argv.slice(2);
  if (urls.length === 0) {
    const response = await fetch(SITEMAP_URL);
    if (!response.ok)
      throw new Error(`${SITEMAP_URL} returned ${response.status}`);
    urls = sitemapUrls(await response.text());
  }
  const payload = buildPayload(urls, INDEXNOW_KEY);
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  // 200 = accepted, 202 = accepted while the key is being verified.
  if (response.status !== 200 && response.status !== 202)
    throw new Error(
      `IndexNow returned ${response.status}: ${await response.text()}`,
    );
  console.log(`Submitted ${urls.length} URLs (HTTP ${response.status})`);
  for (const url of urls) console.log(`  ${url}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main().catch((error: Error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  });
