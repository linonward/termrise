import { createHash } from "node:crypto";

import { and, gt, inArray } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { providerCache } from "@repo/db/schema";

import type { Market } from "./keyword-provider";

export type CacheRequest = {
  provider: string;
  operation: string;
  market: Market;
  /** What makes the answer differ: the seed, the phrase. */
  params: unknown;
};

/** Changes when the stored value shape changes, so old entries are not read. */
export const CACHE_VERSION = 1;

export const cacheKey = (r: CacheRequest) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        CACHE_VERSION,
        r.provider,
        r.operation,
        r.market.locationCode,
        r.market.languageCode,
        r.params,
      ]),
    )
    .digest("hex");

// Paid provider answers kept for reuse (docs/architecture/data-model.md#provider-cache).
// A hit returns the time the provider answered, so stored evidence keeps its real date.
export function createProviderCache(deps: {
  database: Database;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  /** Fresh entries by key; expired and missing keys are absent. */
  async function getMany<T>(requests: CacheRequest[]) {
    const keys = requests.map(cacheKey);
    const found = new Map<string, { value: T; fetchedAt: Date }>();
    if (keys.length === 0) return found;
    const rows = await database
      .select()
      .from(providerCache)
      .where(
        and(
          inArray(providerCache.key, keys),
          gt(providerCache.expiresAt, now()),
        ),
      );
    for (const row of rows)
      found.set(row.key, { value: row.value as T, fetchedAt: row.fetchedAt });
    return found;
  }

  async function get<T>(request: CacheRequest) {
    return (await getMany<T>([request])).get(cacheKey(request)) ?? null;
  }

  async function set(request: CacheRequest, value: unknown, ttlMs: number) {
    const fetchedAt = now();
    const expiresAt = new Date(fetchedAt.getTime() + ttlMs);
    await database
      .insert(providerCache)
      .values({
        key: cacheKey(request),
        provider: request.provider,
        operation: request.operation,
        value,
        fetchedAt,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: providerCache.key,
        set: { value, fetchedAt, expiresAt },
      });
  }

  return { get, getMany, set };
}
