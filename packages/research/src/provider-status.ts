import { desc, eq, gte, sql } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import {
  apiUsage,
  poolRounds,
  radarItems,
  researchProjects,
  workerHeartbeats,
} from "@repo/db/schema";

/** A worker not seen for this long is shown as offline; it writes every minute. */
export const WORKER_OFFLINE_MS = 3 * 60 * 1000;

/** What the worker may spend, in USD per UTC day or month, and how often it runs rounds. */
export type WorkerBudgets = {
  monthly: { data: number; ai: number };
  evergreen: {
    enabled: boolean;
    everyDays: number;
    dailyData: number;
    /** Absent in heartbeats from before S71. */
    dailyAi?: number;
  };
  newWords: {
    enabled: boolean;
    dailyData: number;
    dailyAi: number;
    checks: number;
    /** Absent in heartbeats from before S68. */
    screens?: number;
  };
  /** Absent in heartbeats from before platform sites. */
  platform?: { enabled: boolean; dailyData: number; batch: number };
};

export type WorkerInfo = {
  budgets?: WorkerBudgets;
  workerId: string;
  keywordProvider: string;
  analystProvider: string;
  analystModel: string | null;
  radarSources: string[];
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
          radarSources: info.radarSources,
          budgets: info.budgets ?? null,
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
        failed: sql<number>`(count(*) filter (where ${apiUsage.status} in ('failed', 'released')))::int`,
        spentMicros: sql<number>`coalesce(sum(${apiUsage.costMicros}) filter (where ${apiUsage.status} = 'settled'), 0)::bigint`,
        heldMicros: sql<number>`coalesce(sum(${apiUsage.reservedMicros}) filter (where ${apiUsage.status} in ('reserved', 'failed')), 0)::bigint`,
        lastCallAt: sql<Date>`max(${apiUsage.createdAt})`,
        lastStatus: sql<string>`(array_agg(${apiUsage.status} order by ${apiUsage.createdAt} desc))[1]`,
      })
      .from(apiUsage)
      .innerJoin(researchProjects, eq(researchProjects.id, apiUsage.projectId))
      .where(eq(researchProjects.userId, userId))
      .groupBy(apiUsage.provider, apiUsage.kind)
      .orderBy(apiUsage.kind, apiUsage.provider);
    // The keyword pool's spending, today and this month (UTC), per round kind and budget kind.
    const at = now();
    const dayStart = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    const monthStart = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1),
    );
    const occupied = sql<number>`coalesce(sum(case when ${apiUsage.status} in ('settled', 'released') then ${apiUsage.costMicros} else ${apiUsage.reservedMicros} end), 0)::bigint`;
    const poolSpend = await database
      .select({
        // The same buckets as the budget's daily caps (budget.ts).
        bucket: sql<
          "evergreen" | "new_words" | "platform"
        >`case when ${poolRounds.kind} in ('new_words', 'launch_sites') then 'new_words' when ${poolRounds.kind} = 'platform_sites' then 'platform' else 'evergreen' end`,
        kind: apiUsage.kind,
        todayMicros: sql<number>`coalesce(sum(case when ${apiUsage.createdAt} >= ${dayStart} then (case when ${apiUsage.status} in ('settled', 'released') then ${apiUsage.costMicros} else ${apiUsage.reservedMicros} end) end), 0)::bigint`,
        monthMicros: occupied,
      })
      .from(apiUsage)
      .innerJoin(poolRounds, eq(apiUsage.poolRoundId, poolRounds.id))
      .where(gte(apiUsage.createdAt, monthStart))
      .groupBy(sql`1`, apiUsage.kind);
    const [{ monthData, monthAi }] = await database
      .select({
        monthData: sql<number>`coalesce(sum(case when ${apiUsage.kind} = 'data' then (case when ${apiUsage.status} in ('settled', 'released') then ${apiUsage.costMicros} else ${apiUsage.reservedMicros} end) end), 0)::bigint`,
        monthAi: sql<number>`coalesce(sum(case when ${apiUsage.kind} = 'ai' then (case when ${apiUsage.status} in ('settled', 'released') then ${apiUsage.costMicros} else ${apiUsage.reservedMicros} end) end), 0)::bigint`,
      })
      .from(apiUsage)
      .where(gte(apiUsage.createdAt, monthStart));
    return {
      poolSpend: poolSpend.map((p) => ({
        bucket: p.bucket,
        kind: p.kind,
        todayMicros: Number(p.todayMicros),
        monthMicros: Number(p.monthMicros),
      })),
      monthMicros: { data: Number(monthData), ai: Number(monthAi) },
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
      radarSources: s.worker.radarSources,
      budgets: (s.worker.budgets ?? null) as WorkerBudgets | null,
    },
    poolSpend: s.poolSpend.map((p) => ({
      bucket: p.bucket,
      kind: p.kind,
      todayUsd: usd(p.todayMicros),
      monthUsd: usd(p.monthMicros),
    })),
    monthUsd: { data: usd(s.monthMicros.data), ai: usd(s.monthMicros.ai) },
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
      lastStatus: u.lastStatus as
        "reserved" | "settled" | "failed" | "released",
    })),
  };
}

export type ProviderStatusDto = ReturnType<typeof toProviderStatusDto>;
