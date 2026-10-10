import { asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import {
  executionEvents,
  executionProjects,
  revenueEvents,
} from "@repo/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// The user's products for account export and deletion (docs/runbook.md#delete-or-export-an-account).
// Deleting a product removes its events and revenue too (ON DELETE CASCADE).

export async function exportExecutionData(database: Database, userId: string) {
  const projects = await database
    .select()
    .from(executionProjects)
    .where(eq(executionProjects.userId, userId))
    .orderBy(asc(executionProjects.createdAt));
  const ids = projects.map((p) => p.id);
  const [events, revenue] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          database
            .select()
            .from(executionEvents)
            .where(inArray(executionEvents.projectId, ids))
            .orderBy(asc(executionEvents.periodStart)),
          database
            .select()
            .from(revenueEvents)
            .where(inArray(revenueEvents.projectId, ids))
            .orderBy(asc(revenueEvents.occurredOn)),
        ]);
  return projects.map((p) => ({
    name: p.name,
    repoUrl: p.repoUrl,
    domain: p.domain,
    launchedOn: p.launchedOn,
    status: p.status,
    createdAt: p.createdAt,
    events: events
      .filter((e) => e.projectId === p.id)
      .map(({ metric, count, periodStart, periodEnd, source, note }) => ({
        metric,
        count,
        periodStart,
        periodEnd,
        source,
        note,
      })),
    revenue: revenue
      .filter((r) => r.projectId === p.id)
      .map(
        ({
          occurredOn,
          currency,
          orders,
          grossMinor,
          refundMinor,
          feesMinor,
          source,
          evidence,
          note,
        }) => ({
          occurredOn,
          currency,
          orders,
          grossMinor,
          refundMinor,
          feesMinor,
          source,
          evidence,
          note,
        }),
      ),
  }));
}

export async function eraseExecutionData(
  database: Database | Transaction,
  userId: string,
) {
  await database
    .delete(executionProjects)
    .where(eq(executionProjects.userId, userId));
}
