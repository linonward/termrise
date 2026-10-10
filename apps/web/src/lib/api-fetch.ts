// Browser calls to apps/api (docs/architecture/api.md#api-surface): NEXT_PUBLIC_API_URL is
// inlined at build time, and the session cookie goes along.
export function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}${path}`, {
    ...init,
    credentials: "include",
  });
}
