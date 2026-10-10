import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { creditTransactions, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { adminAdjust, parseArgs } from "./admin-adjust";

const db = testDb();
beforeEach(async () => {
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(closeTestDb);

it("parses the required flags", () => {
  const id = randomUUID();
  expect(
    parseArgs([
      "--user",
      "a",
      "--amount=-5",
      "--id",
      id,
      "--reason",
      "support correction",
    ]),
  ).toEqual({ userId: "a", amount: -5, id, reason: "support correction" });
  expect(() => parseArgs(["--user", "a", "--amount", "5"])).toThrow(
    "Usage: pnpm admin:adjust",
  );
  expect(() =>
    parseArgs(["--user", "a", "--amount", "x", "--id", id, "--reason", "r"]),
  ).toThrow("--amount must be an integer");
});

it("adjusts once per id and reports the balance", async () => {
  const args = {
    userId: "a",
    amount: 15,
    id: randomUUID(),
    reason: "goodwill",
  };
  const first = await adminAdjust(db, args);
  const again = await adminAdjust(db, args);
  expect(first).toEqual({ transactionId: again.transactionId, balance: 15 });
  expect(await db.select().from(creditTransactions)).toHaveLength(1);
  await expect(
    adminAdjust(db, { ...args, id: randomUUID(), amount: -16 }),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
});
