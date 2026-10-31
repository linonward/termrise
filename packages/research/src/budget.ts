import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";

import { ProviderAuthError } from "@repo/ai/provider-errors";
import type { Database } from "@repo/db/client";
import { apiUsage, BUDGET_KINDS, researchProjects } from "@repo/db/schema";

import type { Charged } from "./keyword-provider";

export type BudgetKind = (typeof BUDGET_KINDS)[number];

// A paid call belongs to a research project, or to a keyword pool round (pool-round.ts).
type Call = {
  projectId: string | null;
  poolRoundId?: string | null;
  /** Which daily budget a pool round draws on: evergreen rounds, or new words. */
  poolBudget?: "evergreen" | "new_words";
  runId: string | null;
  kind: BudgetKind;
  provider: string;
  operation: string;
  /** The most the call can cost: reserved before it starts. */
  maxCostMicros: number;
};

// Counted against the budget: the cost once settled or released (0), else the whole
// reservation.
const committed = sql<number>`coalesce(sum(case when ${apiUsage.status} in ('settled', 'released') then ${apiUsage.costMicros} else ${apiUsage.reservedMicros} end), 0)::bigint`;

// The budget ledger (docs/architecture/data-model.md#budget-ledger): every paid call is
// reserved atomically before it starts and settled with the provider's cost after.
export function createBudget(deps: {
  database: Database;
  now?: () => Date;
  /**
   * The service's cap per budget kind for one calendar month (UTC), all projects
   * together: a hard limit on what the paid providers can cost. None when absent.
   */
  monthlyCapMicros?: Record<BudgetKind, number>;
  /**
   * What the keyword pool's rounds may spend on data per calendar day (UTC), all rounds
   * together. Without it, pool rounds cannot make paid calls.
   */
  dailyPoolCapMicros?: number;
  /** The daily caps of new-word rounds, per budget kind; none when absent. */
  dailyNewWordCapMicros?: Record<BudgetKind, number>;
}) {
  const { database, monthlyCapMicros } = deps;
  const now = deps.now ?? (() => new Date());
  // Why the last call of a run (or of a project, without a run) was refused, per kind.
  const refusals = new Map<string, "project" | "daily" | "monthly">();
  const refusalKey = (key: string, kind: BudgetKind) => `${key}:${kind}`;

  /** Why a call of this run (or project) and kind was refused; null when none was. */
  function refusal(runOrProjectId: string, kind: BudgetKind) {
    return refusals.get(refusalKey(runOrProjectId, kind)) ?? null;
  }

  /** Reserves the call's maximum; null when a budget cannot cover it (see refusal()). */
  async function reserve(call: Call) {
    const owner = call.runId ?? call.poolRoundId ?? call.projectId ?? "";
    const refuse = (scope: "project" | "daily" | "monthly") => {
      refusals.set(refusalKey(owner, call.kind), scope);
      return null;
    };
    return database.transaction(async (tx) => {
      if (call.poolRoundId) {
        const newWords = call.poolBudget === "new_words";
        // One lock for all pool rounds, taken before the monthly lock.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('pool-daily-budget'))`,
        );
        const at = now();
        const dayStart = new Date(
          Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
        );
        const [{ total: day }] = await tx
          .select({ total: committed })
          .from(apiUsage)
          .where(
            and(
              isNotNull(apiUsage.poolRoundId),
              newWords
                ? sql`${apiUsage.poolRoundId} in (select id from pool_rounds where kind in ('new_words', 'launch_sites'))`
                : sql`${apiUsage.poolRoundId} in (select id from pool_rounds where kind not in ('new_words', 'launch_sites'))`,
              eq(apiUsage.kind, call.kind),
              gte(apiUsage.createdAt, dayStart),
            ),
          );
        const cap = newWords
          ? (deps.dailyNewWordCapMicros?.[call.kind] ?? 0)
          : call.kind === "data"
            ? (deps.dailyPoolCapMicros ?? 0)
            : 0;
        if (Number(day) + call.maxCostMicros > cap) return refuse("daily");
      } else {
        const projectId = call.projectId ?? "";
        // The project row lock makes concurrent reservations take turns.
        const [project] = await tx
          .select({
            data: researchProjects.dataBudgetMicros,
            ai: researchProjects.aiBudgetMicros,
          })
          .from(researchProjects)
          .where(eq(researchProjects.id, projectId))
          .for("update");
        const [{ total }] = await tx
          .select({ total: committed })
          .from(apiUsage)
          .where(
            and(
              eq(apiUsage.projectId, projectId),
              eq(apiUsage.kind, call.kind),
            ),
          );
        if (Number(total) + call.maxCostMicros > project[call.kind])
          return refuse("project");
      }
      if (monthlyCapMicros) {
        // One lock per kind for the whole service: concurrent reservations of all
        // projects take turns. Taken after the project lock, always in this order.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`monthly-budget:${call.kind}`}))`,
        );
        const at = now();
        const monthStart = new Date(
          Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1),
        );
        const [{ total: month }] = await tx
          .select({ total: committed })
          .from(apiUsage)
          .where(
            and(
              eq(apiUsage.kind, call.kind),
              gte(apiUsage.createdAt, monthStart),
            ),
          );
        if (Number(month) + call.maxCostMicros > monthlyCapMicros[call.kind])
          return refuse("monthly");
      }
      const [row] = await tx
        .insert(apiUsage)
        .values({
          projectId: call.projectId,
          poolRoundId: call.poolRoundId ?? null,
          runId: call.runId,
          kind: call.kind,
          provider: call.provider,
          operation: call.operation,
          reservedMicros: call.maxCostMicros,
          createdAt: now(),
        })
        .returning({ id: apiUsage.id });
      return row.id;
    });
  }

  async function close(
    id: string,
    status: "settled" | "failed" | "released",
    costMicros: number | null,
  ) {
    await database
      .update(apiUsage)
      .set({ status, costMicros, settledAt: now() })
      .where(and(eq(apiUsage.id, id), eq(apiUsage.status, "reserved")));
  }

  /**
   * Reserves, makes the call and settles it. Returns null, without calling, when the
   * budget is short. A failed call keeps its reservation counted: its cost is unknown.
   * A call refused as unauthorized is not billed: its reservation is released.
   */
  async function charge<T>(call: Call, run: () => Promise<Charged<T>>) {
    const id = await reserve(call);
    if (!id) return null;
    let result: Charged<T>;
    try {
      result = await run();
    } catch (error) {
      if (error instanceof ProviderAuthError) await close(id, "released", 0);
      else await close(id, "failed", null);
      throw error;
    }
    await close(id, "settled", result.costMicros);
    return { value: result.value };
  }

  /** Spent, held and remaining per budget, in micro-USD, and the newest calls. */
  async function usage(projectId: string) {
    const [project] = await database
      .select({
        data: researchProjects.dataBudgetMicros,
        ai: researchProjects.aiBudgetMicros,
      })
      .from(researchProjects)
      .where(eq(researchProjects.id, projectId));
    const rows = await database
      .select({
        kind: apiUsage.kind,
        status: apiUsage.status,
        reserved: sql<number>`sum(${apiUsage.reservedMicros})::bigint`,
        cost: sql<number>`coalesce(sum(${apiUsage.costMicros}), 0)::bigint`,
      })
      .from(apiUsage)
      .where(eq(apiUsage.projectId, projectId))
      .groupBy(apiUsage.kind, apiUsage.status);
    const totals = Object.fromEntries(
      BUDGET_KINDS.map((kind) => {
        const of = (status: string) =>
          rows.find((r) => r.kind === kind && r.status === status);
        const spent = Number(of("settled")?.cost ?? 0);
        const held =
          Number(of("reserved")?.reserved ?? 0) +
          Number(of("failed")?.reserved ?? 0);
        return [
          kind,
          {
            budget: project[kind],
            spent,
            held,
            remaining: Math.max(0, project[kind] - spent - held),
          },
        ];
      }),
    ) as Record<
      BudgetKind,
      { budget: number; spent: number; held: number; remaining: number }
    >;
    const calls = await database
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.projectId, projectId))
      .orderBy(desc(apiUsage.createdAt), desc(apiUsage.id))
      .limit(100);
    return { ...totals, calls };
  }

  return { reserve, charge, usage, refusal };
}

export type Budget = ReturnType<typeof createBudget>;
