import { sql } from "drizzle-orm";

import { createDb } from "../client";
import { resolveTestDatabaseUrl } from "./test-database";

let instance: ReturnType<typeof createDb> | undefined;

export function testDb() {
  instance ??= createDb(resolveTestDatabaseUrl());
  return instance;
}

export async function resetDb() {
  await testDb().execute(sql`
    truncate table analytics_consents, api_usage, revenue_events, execution_events, execution_projects, credit_transactions, payment_events, rate_limits, opportunity_decisions, validation_experiments, opportunity_evaluations, opportunities, serp_results, serp_snapshots, keyword_metric_snapshots, keywords, research_runs, source_signals, research_projects, tasks, purchases, subscriptions,
      verification, account, session, "user" restart identity cascade
  `);
}

export async function closeTestDb() {
  await instance?.pool.end();
  instance = undefined;
}
