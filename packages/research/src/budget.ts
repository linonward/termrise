import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { apiUsage, BUDGET_KINDS, researchProjects } from "@repo/db/schema";

import type { Charged } from "./keyword-provider";

export type BudgetKind = (typeof BUDGET_KINDS)[number];

type Call = {
  projectId: string;
  runId: string | null;
  kind: BudgetKind;
  provider: string;
  operation: string;
  /** The most the call can cost: reserved before it starts. */
  maxCostMicros: number;
};

// Counted against the budget: the cost once settled, else the whole reservation.
const committed = sql<number>`coalesce(sum(case when ${apiUsage.status} = 'settled' then ${apiUsage.costMicros} else ${apiUsage.reservedMicros} end), 0)::bigint`;

// The budget ledger (docs/architecture/data-model.md#budget-ledger): every paid call is
// reserved atomically before it starts and settled with the provider's cost after.
export function createBudget(deps: { database: Database; now?: () => Date }) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  /** Reserves the call's maximum; null when the project's budget cannot cover it. */
  async function reserve(call: Call) {
    return database.transaction(async (tx) => {
      // The project row lock makes concurrent reservations take turns.
      const [project] = await tx
        .select({
          data: researchProjects.dataBudgetMicros,
          ai: researchProjects.aiBudgetMicros,
        })
        .from(researchProjects)
        .where(eq(researchProjects.id, call.projectId))
        .for("update");
      const [{ total }] = await tx
        .select({ total: committed })
        .from(apiUsage)
        .where(
          and(
            eq(apiUsage.projectId, call.projectId),
            eq(apiUsage.kind, call.kind),
          ),
        );
      if (Number(total) + call.maxCostMicros > project[call.kind]) return null;
      const [row] = await tx
        .insert(apiUsage)
        .values({
          projectId: call.projectId,
          runId: call.runId,
          kind: call.kind,
          provider: call.provider,
          operation: call.operation,
          reservedMicros: call.maxCostMicros,
        })
        .returning({ id: apiUsage.id });
      return row.id;
    });
  }

  async function close(
    id: string,
    status: "settled" | "failed",
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
   */
  async function charge<T>(call: Call, run: () => Promise<Charged<T>>) {
    const id = await reserve(call);
    if (!id) return null;
    let result: Charged<T>;
    try {
      result = await run();
    } catch (error) {
      await close(id, "failed", null);
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

  return { reserve, charge, usage };
}

export type Budget = ReturnType<typeof createBudget>;
