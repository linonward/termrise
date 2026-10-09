// Vercel Web Analytics and Speed Insights (docs/architecture/observability.md#web-analytics)
// record the page URL. Keep only the path and UTM parameters, and hide ids, so no token, email,
// order or task id leaves the browser.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function redactUrl(href: string) {
  const url = new URL(href);
  url.pathname = url.pathname
    .split("/")
    .map((part) => (ID.test(part) ? "[id]" : part))
    .join("/");
  const kept = [...url.searchParams].filter(([key]) => key.startsWith("utm_"));
  url.search = new URLSearchParams(kept).toString();
  // The URL setter percent-encodes the brackets.
  return url.toString().replaceAll("%5Bid%5D", "[id]");
}

/** `beforeSend` for Web Analytics and Speed Insights. */
export function redactEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: redactUrl(event.url) };
}
