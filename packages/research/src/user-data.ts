import { asc, eq } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { researchProjects } from "@repo/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// The user's research projects for account export and deletion (docs/runbook.md#delete-or-export-an-account).
// Nothing else references them, so deletion removes the rows.

export async function exportResearchData(database: Database, userId: string) {
  return database
    .select({
      id: researchProjects.id,
      createdAt: researchProjects.createdAt,
      name: researchProjects.name,
      locationCode: researchProjects.locationCode,
      languageCode: researchProjects.languageCode,
      seeds: researchProjects.seeds,
      status: researchProjects.status,
    })
    .from(researchProjects)
    .where(eq(researchProjects.userId, userId))
    .orderBy(asc(researchProjects.createdAt));
}

export async function eraseResearchData(
  database: Database | Transaction,
  userId: string,
) {
  await database
    .delete(researchProjects)
    .where(eq(researchProjects.userId, userId));
}
