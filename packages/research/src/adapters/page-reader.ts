// Reads a result page as text for the page judge (docs/product/keyword-pool.md#page-check):
// title, first heading and the start of the visible text. Free; a page that cannot be read
// comes back with its status so the judge can say so.
export type PageText = {
  url: string;
  status: number | null;
  title: string | null;
  h1: string | null;
  /** The start of the visible text, at most TEXT_MAX characters. */
  text: string;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; termrise-pages/1.0; +https://termrise.com)";
const BYTES_MAX = 300_000;
export const TEXT_MAX = 1_500;

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Title, first h1 and visible text of an HTML document. */
export function pageText(html: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const body = html
    .replace(
      /<(script|style|noscript|svg|nav|footer|header|head)[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<[^>]+>/g, " ");
  return {
    title: title ? decode(title.replace(/<[^>]+>/g, "")) || null : null,
    h1: h1 ? decode(h1.replace(/<[^>]+>/g, "")) || null : null,
    text: decode(body).slice(0, TEXT_MAX),
  };
}

export async function readPage(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<PageText> {
  const res = await fetcher(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res) return { url, status: null, title: null, h1: null, text: "" };
  if (!(res.headers.get("content-type") ?? "").includes("html"))
    return { url, status: res.status, title: null, h1: null, text: "" };
  const html = (await res.text()).slice(0, BYTES_MAX);
  return { url, status: res.status, ...pageText(html) };
}
