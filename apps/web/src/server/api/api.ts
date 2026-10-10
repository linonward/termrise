import "server-only";
import { headers } from "next/headers";
import { cache } from "react";

import { serverEnv } from "@repo/config/env";

import { createApiClient } from "./api-client";

let instance: ReturnType<typeof createApiClient> | undefined;
const client = () =>
  (instance ??= createApiClient(serverEnv().NEXT_PUBLIC_API_URL));

/** GET from apps/api as the signed-in user of the current request; throws on non-2xx. */
export async function apiGet<T>(path: string): Promise<T> {
  return client().get<T>(path, await headers());
}

/** Any call to apps/api as the current user; the caller reads the status and body. */
export async function apiRequest(path: string, init: RequestInit = {}) {
  return client().request(path, await headers(), init);
}

/**
 * The balance, after timed-out paid records are refunded. Cached per request: the
 * signed-in layout and the page show the same number, and pages read it before the
 * lists, which then include the refunds (docs/architecture/tasks.md#stale-tasks).
 */
export const getBalance = cache(async () =>
  apiGet<{ balance: number }>("/api/credits/balance").then((b) => b.balance),
);

/**
 * Whether the current user may use /admin; apps/api checks ADMIN_USER_IDS. Callers answer
 * 404 so /admin does not reveal that it exists (docs/architecture/security.md#admin-access).
 */
export const isAdmin = cache(async () => {
  const response = await apiRequest("/api/admin/session");
  if (response.status === 204) return true;
  if (response.status === 401 || response.status === 404) return false;
  throw new Error(`API /api/admin/session failed: ${response.status}`);
});
