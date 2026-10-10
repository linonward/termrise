/**
 * Server-side reads from apps/api for a page, forwarding only the request's cookies (the
 * session). Any non-2xx answer throws: pages check the session first, so a failure here
 * is an API problem, not a signed-out user.
 */
export function createApiClient(
  apiUrl: string,
  transport: typeof fetch = fetch,
) {
  return async function apiGet<T>(path: string, headers: Headers): Promise<T> {
    const response = await transport(new URL(path, apiUrl), {
      headers: { cookie: headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`API ${path} failed: ${response.status}`);
    return (await response.json()) as T;
  };
}
