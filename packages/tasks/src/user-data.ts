import { asc, eq } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { tasks } from "@repo/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// The user's Task content for account export and deletion (docs/runbook.md#delete-or-export-an-account).
// Rows stay: the ledger points at them. Only what the user wrote and got back is erased.

export async function exportTaskData(database: Database, userId: string) {
  return database
    .select({
      id: tasks.id,
      createdAt: tasks.createdAt,
      status: tasks.status,
      input: tasks.input,
      output: tasks.output,
      creditsCost: tasks.creditsCost,
    })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.createdAt));
}

export async function eraseTaskData(
  database: Database | Transaction,
  userId: string,
) {
  await database
    .update(tasks)
    .set({ input: "", output: null })
    .where(eq(tasks.userId, userId));
}
