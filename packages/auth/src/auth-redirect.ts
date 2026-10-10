// Only accept unambiguous site-relative destinations, including query strings.
export function safeNext(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return "/dashboard";
  if (/[\\\u0000-\u001f\u007f]|%0[ad]/i.test(value)) return "/dashboard";
  // Encoded slashes are ambiguous only in the path; in the query
  // (?next=%2Fdashboard from the login form) they are ordinary encoding.
  if (/%2f|%5c|%25/i.test(value.split(/[?#]/)[0])) return "/dashboard";
  const url = new URL(value, "https://app.invalid");
  // Dot segments can normalize to a new leading "//" ("/.//evil" → "//evil").
  return url.origin === "https://app.invalid" && !url.pathname.startsWith("//")
    ? `${url.pathname}${url.search}${url.hash}`
    : "/dashboard";
}

/**
 * Better Auth callback URLs: a safe site-relative path, or (apps/api on its own origin)
 * the same path as an absolute URL on the web app's origin.
 */
export function isSafeCallback(value: unknown, appOrigin?: string): boolean {
  if (typeof value !== "string") return false;
  if (value === safeNext(value)) return true;
  if (!appOrigin || !value.startsWith(`${appOrigin}/`)) return false;
  const path = value.slice(appOrigin.length);
  return path === safeNext(path);
}
