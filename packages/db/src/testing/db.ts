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
    truncate table analytics_consents, credit_transactions, payment_events, rate_limits, source_signals, research_projects, tasks, purchases, subscriptions,
      verification, account, session, "user" restart identity cascade
  `);
}

export async function closeTestDb() {
  await instance?.pool.end();
  instance = undefined;
}
