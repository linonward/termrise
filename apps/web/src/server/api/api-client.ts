/**
 * Server-side calls from the web app to apps/api, forwarding only the request's cookies
 * (the session). get() throws on any non-2xx answer: pages check the session first, so a
 * failure there is an API problem, not a signed-out user. request() returns the response
 * for callers that handle 404 or error codes themselves.
 */
export function createApiClient(
  apiUrl: string,
  transport: typeof fetch = fetch,
) {
  function request(path: string, headers: Headers, init: RequestInit = {}) {
    return transport(new URL(path, apiUrl), {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        cookie: headers.get("cookie") ?? "",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  }

  async function get<T>(path: string, headers: Headers): Promise<T> {
    const response = await request(path, headers);
    if (!response.ok) throw new Error(`API ${path} failed: ${response.status}`);
    return (await response.json()) as T;
  }

  return { request, get };
}
