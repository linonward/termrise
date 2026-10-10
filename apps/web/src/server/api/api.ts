import "server-only";
import { headers } from "next/headers";
import { cache } from "react";

import { serverEnv } from "@repo/config/env";

import { createApiClient } from "./api-client";

let instance: ReturnType<typeof createApiClient> | undefined;

/** GET from apps/api as the signed-in user of the current request. */
export async function apiGet<T>(path: string): Promise<T> {
  instance ??= createApiClient(serverEnv().NEXT_PUBLIC_API_URL);
  return instance<T>(path, await headers());
}

/**
 * The balance, after timed-out paid records are refunded. Cached per request: the
 * signed-in layout and the page show the same number, and pages read it before the
 * lists, which then include the refunds (docs/architecture/tasks.md#stale-tasks).
 */
export const getBalance = cache(async () =>
  apiGet<{ balance: number }>("/api/credits/balance").then((b) => b.balance),
);
