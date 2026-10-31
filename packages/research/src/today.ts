// The Today page (docs/product/ux.md#today): what needs the maintainer now, in one read.
// New words worth a look, keywords waiting for a decision, the latest rounds, this
// month's spending and whether the worker runs.
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  isNotNull,
  sql,
} from "drizzle-orm";

import type { Database } from "@repo/db/client";
import {
  apiUsage,
  newWords,
  poolKeywords,
  poolRounds,
  workerHeartbeats,
} from "@repo/db/schema";

import type { WorkerBudgets } from "./provider-status";

/** New words checked this recently count as today's. */
const NEW_WORD_WINDOW_MS = 2 * 86_400_000;
/** A worker heard from this recently is online (it writes every minute). */
const ONLINE_MS = 3 * 60_000;
const LIST = 5;

const committed = sql<number>`coalesce(sum(case when ${apiUsage.status} in ('settled', 'released') then ${apiUsage.costMicros} else ${apiUsage.reservedMicros} end), 0)::bigint`;

/** How often each kind of round runs, from the worker's heartbeat; null when unknown. */
function scheduleOf(b: WorkerBudgets | null) {
  if (!b) return null;
  return {
    newWordsScanHours: b.newWords.enabled
      ? (b.newWords.scanHours ?? null)
      : null,
    newWordsDaily: b.newWords.enabled,
    evergreenEveryDays: b.evergreen.enabled ? b.evergreen.everyDays : null,
  };
}

export function createToday(deps: { database: Database; now?: () => Date }) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  async function summary() {
    const at = now();
    const monthStart = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1),
    );
    const since = new Date(at.getTime() - NEW_WORD_WINDOW_MS);
    const fresh = and(
      isNull(newWords.hiddenAt),
      gte(newWords.checkedAt, since),
      inArray(newWords.verdict, ["worth", "try"]),
    );
    const review = inArray(poolKeywords.status, ["candidate", "watch"]);
    const [
      words,
      wordCounts,
      candidates,
      [{ waiting }],
      rounds,
      spend,
      [heartbeat],
    ] = await Promise.all([
      database
        .select()
        .from(newWords)
        .where(fresh)
        .orderBy(sql`${newWords.verdict} = 'worth' desc`, desc(newWords.ratio))
        .limit(LIST),
      database
        .select({ verdict: newWords.verdict, n: sql<number>`count(*)::int` })
        .from(newWords)
        .where(fresh)
        .groupBy(newWords.verdict),
      database
        .select()
        .from(poolKeywords)
        .where(review)
        .orderBy(desc(poolKeywords.updatedAt))
        .limit(LIST),
      database
        .select({ waiting: sql<number>`count(*)::int` })
        .from(poolKeywords)
        .where(review),
      // The newest round of each kind group.
      database
        .select()
        .from(poolRounds)
        .orderBy(desc(poolRounds.createdAt))
        .limit(20),
      database
        .select({
          bucket: sql<string>`case when ${apiUsage.projectId} is not null then 'research' when ${poolRounds.kind} in ('new_words', 'launch_sites') then 'new_words' when ${poolRounds.kind} = 'platform_sites' then 'platform' else 'evergreen' end`,
          kind: apiUsage.kind,
          spent: committed,
        })
        .from(apiUsage)
        .leftJoin(poolRounds, eq(apiUsage.poolRoundId, poolRounds.id))
        .where(gte(apiUsage.createdAt, monthStart))
        .groupBy(sql`1`, apiUsage.kind),
      database
        .select({
          lastSeenAt: workerHeartbeats.lastSeenAt,
          budgets: workerHeartbeats.budgets,
        })
        .from(workerHeartbeats)
        .where(isNotNull(workerHeartbeats.lastSeenAt))
        .orderBy(desc(workerHeartbeats.lastSeenAt))
        .limit(1),
    ]);
    const latest = (kinds: string[]) =>
      rounds.find((r) => kinds.includes(r.kind)) ?? null;
    return {
      newWords: words,
      newWordCounts: Object.fromEntries(
        wordCounts.map((c) => [c.verdict, c.n]),
      ) as Partial<Record<"worth" | "try", number>>,
      candidates,
      waiting,
      evergreenRound: latest(["daily", "manual"]),
      newWordsRound: latest(["new_words"]),
      spend: spend.map((s) => ({
        bucket: s.bucket,
        kind: s.kind,
        micros: Number(s.spent),
      })),
      worker: heartbeat
        ? {
            lastSeenAt: heartbeat.lastSeenAt,
            online: at.getTime() - heartbeat.lastSeenAt.getTime() < ONLINE_MS,
            // How often the rounds run, as the worker reports it.
            schedule: scheduleOf(heartbeat.budgets as WorkerBudgets | null),
          }
        : null,
    };
  }

  return { summary };
}
