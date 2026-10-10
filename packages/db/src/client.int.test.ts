import { sql } from "drizzle-orm";
import { afterEach, expect, it } from "vitest";

import { connectDb } from "./client";
import { resolveTestDatabaseUrl } from "./testing/test-database";

// connectDb() is the per-request connection of apps/api (Cloudflare Workers + Hyperdrive).
// CreditService needs interactive transactions and transaction-level advisory locks on it.
const open: { close(): Promise<void> }[] = [];
async function connect() {
  const database = await connectDb(resolveTestDatabaseUrl());
  open.push(database);
  return database;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((database) => database.close()));
});

it("runs queries on one connection", async () => {
  const database = await connect();
  const result = await database.execute(sql`select 1 as one`);
  expect(result.rows).toEqual([{ one: 1 }]);
});

it("rolls back a failed transaction", async () => {
  const database = await connect();
  await database.execute(sql`create temp table t (n int)`);
  await expect(
    database.transaction(async (tx) => {
      await tx.execute(sql`insert into t values (1)`);
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  const result = await database.execute(sql`select count(*)::int as n from t`);
  expect(result.rows).toEqual([{ n: 0 }]);
});

it("holds a transaction-level advisory lock until commit", async () => {
  const [first, second] = [await connect(), await connect()];
  const events: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let locked!: () => void;
  const lockTaken = new Promise<void>((resolve) => (locked = resolve));

  const firstTx = first.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
    locked();
    await held;
    events.push("first commits");
  });
  await lockTaken;
  const secondTx = second.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4242)`);
    events.push("second locks");
  });

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(events).toEqual([]);
  release();
  await Promise.all([firstTx, secondTx]);
  expect(events).toEqual(["first commits", "second locks"]);
});

it("fails to connect to an unreachable database", async () => {
  // Nothing listens on port 1: the connection is refused at once.
  await expect(
    connectDb("postgresql://postgres:postgres@localhost:1/app"),
  ).rejects.toThrow();
});
