import { sql } from "drizzle-orm";

import { createDb, type Database } from "../client";
import { resolveTestDatabaseUrl } from "./test-database";

let instance: Database | undefined;

export function testDb(): Database {
  instance ??= createDb(resolveTestDatabaseUrl());
  return instance;
}

export async function resetDb() {
  await testDb().execute(sql`
    truncate table analytics_consents, credit_transactions, payment_events, rate_limits, tasks, purchases, subscriptions,
      verification, account, session, "user" restart identity cascade
  `);
}

export async function closeTestDb() {
  await instance?.pool.end();
  instance = undefined;
}
