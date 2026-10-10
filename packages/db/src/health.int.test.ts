import { afterAll, expect, it } from "vitest";

import { createDb } from "@repo/db/client";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import { checkDatabase } from "./health-check";

// Nothing listens on port 1: the connection is refused at once.
const unreachable = createDb("postgresql://postgres:postgres@localhost:1/app");
afterAll(async () => {
  await unreachable.pool.end();
  await closeTestDb();
});

it("reports a reachable database", async () => {
  expect(await checkDatabase(testDb())).toBe(true);
});

it("reports an unreachable database without throwing", async () => {
  expect(await checkDatabase(unreachable)).toBe(false);
});
