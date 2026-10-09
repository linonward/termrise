import { existsSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import {
  assertLocalTestDatabase,
  resolveTestDatabaseUrl,
} from "./test-database";

// Vitest globalSetup for the integration project: create this worktree's test database
// if needed and apply all migrations.
export default async function setup() {
  const url = resolveTestDatabaseUrl();
  const parsed = assertLocalTestDatabase(url);
  const name = parsed.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const adminClient = new Client({ connectionString: admin.toString() });
  await adminClient.connect();
  try {
    const { rowCount } = await adminClient.query(
      "select 1 from pg_database where datname = $1",
      [name],
    );
    if (!rowCount) await adminClient.query(`create database "${name}"`);
  } finally {
    await adminClient.end();
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(drizzle({ client }), {
      migrationsFolder: ["packages/db/migrations", "migrations"].find((dir) =>
        existsSync(dir),
      )!,
    });
  } finally {
    await client.end();
  }
}
