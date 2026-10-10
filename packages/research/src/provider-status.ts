import { desc, eq, sql } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import {
  apiUsage,
  radarItems,
  researchProjects,
  workerHeartbeats,
} from "@repo/db/schema";

/** A worker not seen for this long is shown as offline; it writes every minute. */
export const WORKER_OFFLINE_MS = 3 * 60 * 1000;

export type WorkerInfo = {
  workerId: string;
  keywordProvider: string;
  analystProvider: string;
  analystModel: string | null;
  radarEnabled: boolean;
};

// The services as the worker runs them, and what a user's projects spent on each
// provider (docs/architecture/data-model.md#worker-heartbeats). The connection state is
// the result of the provider's last real call: no extra call to check it.
export function createProviderStatus(deps: {
  database: Database;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  /** Records the worker's configuration; the first call also sets its start time. */
  async function heartbeat(info: WorkerInfo) {
    const at = now();
    await database
      .insert(workerHeartbeats)
      .values({ ...info, startedAt: at, lastSeenAt: at })
      .onConflictDoUpdate({
        target: workerHeartbeats.workerId,
        set: {
          keywordProvider: info.keywordProvider,
          analystProvider: info.analystProvider,
          analystModel: info.analystModel,
          radarEnabled: info.radarEnabled,
          lastSeenAt: at,
        },
      });
  }

  async function forUser(userId: string) {
    const [worker] = await database
      .select()
      .from(workerHeartbeats)
      .orderBy(desc(workerHeartbeats.lastSeenAt))
      .limit(1);
    const [radar] = await database
      .select({
        items: sql<number>`count(*)::int`,
        lastCollectedAt: sql<Date | null>`max(${radarItems.lastSeenAt})`,
      })
      .from(radarItems);
    const usage = await database
      .select({
        provider: apiUsage.provider,
        kind: apiUsage.kind,
        calls: sql<number>`count(*)::int`,
        failed: sql<number>`(count(*) filter (where ${apiUsage.status} = 'failed'))::int`,
        spentMicros: sql<number>`coalesce(sum(${apiUsage.costMicros}) filter (where ${apiUsage.status} = 'settled'), 0)::bigint`,
        heldMicros: sql<number>`coalesce(sum(${apiUsage.reservedMicros}) filter (where ${apiUsage.status} <> 'settled'), 0)::bigint`,
        lastCallAt: sql<Date>`max(${apiUsage.createdAt})`,
        lastStatus: sql<string>`(array_agg(${apiUsage.status} order by ${apiUsage.createdAt} desc))[1]`,
      })
      .from(apiUsage)
      .innerJoin(researchProjects, eq(researchProjects.id, apiUsage.projectId))
      .where(eq(researchProjects.userId, userId))
      .groupBy(apiUsage.provider, apiUsage.kind)
      .orderBy(apiUsage.kind, apiUsage.provider);
    return {
      worker: worker
        ? {
            ...worker,
            online:
              now().getTime() - worker.lastSeenAt.getTime() < WORKER_OFFLINE_MS,
          }
        : null,
      radar: {
        items: radar.items,
        lastCollectedAt: radar.lastCollectedAt
          ? new Date(radar.lastCollectedAt)
          : null,
      },
      usage: usage.map((u) => ({
        ...u,
        spentMicros: Number(u.spentMicros),
        heldMicros: Number(u.heldMicros),
        lastCallAt: new Date(u.lastCallAt),
      })),
    };
  }

  return { heartbeat, forUser };
}

export type ProviderStatus = Awaited<
  ReturnType<ReturnType<typeof createProviderStatus>["forUser"]>
>;

const usd = (micros: number) => micros / 1_000_000;

export function toProviderStatusDto(s: ProviderStatus) {
  return {
    worker: s.worker && {
      online: s.worker.online,
      lastSeenAt: s.worker.lastSeenAt.toISOString(),
      keywordProvider: s.worker.keywordProvider,
      analystProvider: s.worker.analystProvider,
      analystModel: s.worker.analystModel,
      radarEnabled: s.worker.radarEnabled,
    },
    radar: {
      items: s.radar.items,
      lastCollectedAt: s.radar.lastCollectedAt?.toISOString() ?? null,
    },
    usage: s.usage.map((u) => ({
      provider: u.provider,
      kind: u.kind,
      calls: u.calls,
      failed: u.failed,
      spentUsd: usd(u.spentMicros),
      heldUsd: usd(u.heldMicros),
      lastCallAt: u.lastCallAt.toISOString(),
      lastStatus: u.lastStatus as "reserved" | "settled" | "failed",
    })),
  };
}

export type ProviderStatusDto = ReturnType<typeof toProviderStatusDto>;
