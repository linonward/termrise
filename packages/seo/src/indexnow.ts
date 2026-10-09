// IndexNow (Bing and other engines): docs/product/ux.md#seo.
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

export function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map(([, loc]) =>
    loc!.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]!),
  );
}

/** IndexNow request body; `key` must be served at https://<host>/<key>.txt. */
export function buildPayload(urls: string[], key: string) {
  if (urls.length === 0) throw new Error("No URLs to submit");
  const host = new URL(urls[0]!).host;
  const other = urls.find((url) => new URL(url).host !== host);
  if (other) throw new Error(`URLs must share one host: ${host}, ${other}`);
  return {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: urls,
  };
}
