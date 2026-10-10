import { desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import { radarItems, radarObservations } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import {
  HACKER_NEWS_LISTS,
  type HackerNewsItem,
  type HackerNewsList,
  type HackerNewsSource,
} from "./adapters/hacker-news";
import {
  RADAR_LIST_LIMIT,
  RADAR_PAGE_SIZE,
  RADAR_SORTS,
  RADAR_TITLE_MAX_LENGTH,
  radarTerm,
  safeUrl,
} from "./radar-rules";

export type RadarItem = typeof radarItems.$inferSelect;
export type RadarObservation = typeof radarObservations.$inferSelect;

type Sighting = { list: HackerNewsList; rank: number };

const listQuery = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  sort: z.enum(RADAR_SORTS).catch("new"),
});

// Runs `task` on each value, at most `limit` at a time.
async function forEachLimit<T>(
  values: T[],
  limit: number,
  task: (value: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (next < values.length) await task(values[next++]);
    }),
  );
}

// The radar (docs/architecture/data-model.md#radar): the worker collects public stories,
// every signed-in user reads them. Discussion counts are not search demand.
export function createRadar(deps: {
  database: Database;
  hackerNews?: HackerNewsSource;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  async function save(
    item: HackerNewsItem & { title: string },
    sightings: Sighting[],
    observedAt: Date,
  ) {
    const title = item.title.trim().slice(0, RADAR_TITLE_MAX_LENGTH);
    const current = {
      url: safeUrl(item.url),
      title,
      normalizedTerm: radarTerm(title),
      score: item.score ?? null,
      comments: item.descendants ?? null,
    };
    await database.transaction(async (tx) => {
      const [row] = await tx
        .insert(radarItems)
        .values({
          provider: "hacker_news",
          externalId: String(item.id),
          postedAt: item.time ? new Date(item.time * 1000) : null,
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
          ...current,
        })
        .onConflictDoUpdate({
          target: [radarItems.provider, radarItems.externalId],
          set: { ...current, lastSeenAt: observedAt },
        })
        .returning({ id: radarItems.id });
      await tx.insert(radarObservations).values(
        sightings.map((s) => ({
          itemId: row.id,
          observedAt,
          list: s.list,
          rank: s.rank,
          score: current.score,
          comments: current.comments,
        })),
      );
    });
  }

  /**
   * Reads the first stories of each Hacker News list and records one observation per
   * story and list. A story that fails is skipped; the job fails only when all do.
   */
  async function collectHackerNews(
    options: { limit?: number; concurrency?: number } = {},
  ) {
    const source = deps.hackerNews;
    if (!source) throw new Error("No Hacker News source");
    const limit = options.limit ?? RADAR_LIST_LIMIT;
    const observedAt = now();
    const sightings = new Map<number, Sighting[]>();
    for (const list of Object.keys(HACKER_NEWS_LISTS) as HackerNewsList[]) {
      const ids = (await source.storyIds(list)).slice(0, limit);
      ids.forEach((id, index) =>
        sightings.set(id, [
          ...(sightings.get(id) ?? []),
          { list, rank: index + 1 },
        ]),
      );
    }
    const ids = [...sightings.keys()];
    const result = { saved: 0, skipped: 0, failed: 0 };
    await forEachLimit(ids, options.concurrency ?? 5, async (id) => {
      let item;
      try {
        item = await source.item(id);
      } catch (error) {
        result.failed++;
        logger.warn("radar.item_failed", {
          provider: "hacker_news",
          id,
          error,
        });
        return;
      }
      // Jobs, polls, dead and deleted items are not stories to research.
      if (
        !item ||
        item.type !== "story" ||
        item.dead ||
        item.deleted ||
        !item.title?.trim()
      ) {
        result.skipped++;
        return;
      }
      await save(
        { ...item, title: item.title },
        sightings.get(id)!,
        observedAt,
      );
      result.saved++;
    });
    if (ids.length > 0 && result.failed === ids.length)
      throw new Error("Every Hacker News item failed");
    return result;
  }

  /** Items for the radar list: newest first seen, or highest score. */
  async function list(query: Record<string, string | undefined> = {}) {
    const { q, sort } = listQuery.parse(query);
    const pattern = q && `%${q.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    return database
      .select()
      .from(radarItems)
      .where(pattern ? ilike(radarItems.normalizedTerm, pattern) : undefined)
      .orderBy(
        ...(sort === "score"
          ? [sql`${radarItems.score} desc nulls last`]
          : [desc(radarItems.firstSeenAt)]),
        desc(radarItems.lastSeenAt),
        desc(radarItems.id),
      )
      .limit(RADAR_PAGE_SIZE);
  }

  /** One item with its observations, newest first. */
  async function get(id: string) {
    if (!z.uuid().safeParse(id).success) throw notFound();
    const [item] = await database
      .select()
      .from(radarItems)
      .where(eq(radarItems.id, id));
    if (!item) throw notFound();
    const observations = await database
      .select()
      .from(radarObservations)
      .where(eq(radarObservations.itemId, id))
      .orderBy(desc(radarObservations.observedAt), radarObservations.list)
      .limit(200);
    return { item, observations };
  }

  return { collectHackerNews, list, get };
}

const notFound = () =>
  new AppError("RADAR_ITEM_NOT_FOUND", "Radar item not found");
