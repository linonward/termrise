import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { createFakeAiProvider } from "@repo/ai/adapters/fake";
import { createCreditService } from "@repo/credits/credit-service";
import {
  account,
  analyticsConsents,
  creditTransactions,
  purchases,
  session,
  subscriptions,
  tasks,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createFakeStorage } from "@repo/storage/adapters/fake";
import { createTaskService } from "@repo/tasks/task-service";
import { eraseTaskData, exportTaskData } from "@repo/tasks/user-data";

import {
  AccountError,
  createAccountService,
  type ProductData,
} from "./account-service";

// As the app composes it (apps/api/src/product-data.ts).
const productData: ProductData = {
  export: async (database, userId) => ({
    tasks: await exportTaskData(database, userId),
  }),
  erase: eraseTaskData,
};

const db = testDb();
beforeEach(resetDb);
afterAll(closeTestDb);

const png = { contentType: "image/png", body: new Uint8Array(1) };

async function seed() {
  await db.insert(user).values([
    { id: "u1", name: "Ann", email: "ann@example.com", image: "https://x/a" },
    { id: "u2", name: "Bob", email: "bob@example.com" },
  ]);
  await createCreditService(db).grantSignupBonus("u1", 10);
  await createCreditService(db).grantSignupBonus("u2", 10);
  await db.insert(session).values({
    id: "s1",
    userId: "u1",
    token: "t1",
    expiresAt: new Date(Date.now() + 60_000),
  });
  await db.insert(account).values({
    id: "a1",
    userId: "u1",
    accountId: "google-1",
    providerId: "google",
    accessToken: "secret-token",
  });
  await db.insert(analyticsConsents).values({ userId: "u1", granted: true });
  await db.insert(purchases).values({
    userId: "u1",
    provider: "fake",
    packId: "starter",
    amountUsd: 590,
    credits: 10,
    status: "PAID",
  });
  const taskService = createTaskService({
    database: db,
    provider: createFakeAiProvider(),
  });
  await taskService.run("u1", {
    requestId: randomUUID(),
    input: "a private prompt",
  });
  await taskService.run("u2", {
    requestId: randomUUID(),
    input: "bob's prompt",
  });

  const storage = createFakeStorage();
  storage.simulateUpload("uploads/u1/a.png", png);
  storage.simulateUpload("uploads/u2/b.png", png);
  const service = createAccountService(db, { storage, product: productData });
  return { service, storage };
}

const balanceMatchesLedger = async (userId: string) => {
  const [row] = await db
    .select({
      balance: user.creditBalance,
      sum: sql<number>`(select coalesce(sum(amount), 0)::int from credit_transactions where user_id = ${userId})`,
    })
    .from(user)
    .where(eq(user.id, userId));
  return row!.balance === row!.sum;
};

it("exports the user's data without secrets", async () => {
  const { service } = await seed();
  const data = await service.exportUser("u1");

  expect(data.user).toMatchObject({
    id: "u1",
    email: "ann@example.com",
    name: "Ann",
    creditBalance: 9,
  });
  expect(data.signInMethods).toEqual([
    { providerId: "google", createdAt: expect.any(Date) },
  ]);
  expect(data.analyticsConsent).toMatchObject({ granted: true });
  expect(data.creditTransactions.map((t) => t.type).sort()).toEqual([
    "SIGNUP_BONUS",
    "TASK_DEBIT",
  ]);
  expect(data.purchases).toHaveLength(1);
  expect(data.subscriptions).toEqual([]);
  expect(data.product.tasks).toEqual([
    expect.objectContaining({ input: "a private prompt" }),
  ]);
  expect(data.uploads).toEqual(["uploads/u1/a.png"]);
  expect(JSON.stringify(data)).not.toContain("secret-token");
  expect(JSON.stringify(data)).not.toContain("bob");
});

it("anonymizes the user, keeps financial records and leaves others alone", async () => {
  const { service, storage } = await seed();
  expect(await service.planDeletion("u1")).toEqual({
    userId: "u1",
    alreadyDeleted: false,
    activeSubscriptionId: null,
    uploads: ["uploads/u1/a.png"],
  });

  expect(await service.deleteUser("u1")).toEqual({
    alreadyDeleted: false,
    uploadsDeleted: 1,
  });

  const [deleted] = await db.select().from(user).where(eq(user.id, "u1"));
  expect(deleted).toMatchObject({
    email: "deleted-u1@deleted.invalid",
    name: "Deleted user",
    image: null,
    emailVerified: false,
  });
  expect(
    await db.select().from(user).where(eq(user.email, "ann@example.com")),
  ).toEqual([]);
  expect(await db.select().from(session)).toEqual([]);
  expect(await db.select().from(account)).toEqual([]);
  expect(await db.select().from(analyticsConsents)).toEqual([]);
  const [task] = await db.select().from(tasks).where(eq(tasks.userId, "u1"));
  expect(task).toMatchObject({ input: "", output: null });
  expect(await storage.list("uploads/u1/")).toEqual([]);

  // Kept by law: the ledger, purchases and the balance they add up to.
  expect(
    await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, "u1")),
  ).toHaveLength(2);
  expect(await db.select().from(purchases)).toHaveLength(1);
  expect(await balanceMatchesLedger("u1")).toBe(true);

  // The other user is untouched.
  const [bob] = await db.select().from(user).where(eq(user.id, "u2"));
  expect(bob!.email).toBe("bob@example.com");
  const [bobTask] = await db.select().from(tasks).where(eq(tasks.userId, "u2"));
  expect(bobTask!.input).toBe("bob's prompt");
  expect(await storage.list("uploads/u2/")).toEqual(["uploads/u2/b.png"]);
});

it("is safe to run again", async () => {
  const { service, storage } = await seed();
  await service.deleteUser("u1");
  storage.simulateUpload("uploads/u1/late.png", png);

  expect((await service.planDeletion("u1")).alreadyDeleted).toBe(true);
  expect(await service.deleteUser("u1")).toEqual({
    alreadyDeleted: true,
    uploadsDeleted: 1,
  });
  const [deleted] = await db.select().from(user).where(eq(user.id, "u1"));
  expect(deleted!.email).toBe("deleted-u1@deleted.invalid");
});

it.each(["ACTIVE", "PAST_DUE", "CANCELING"] as const)(
  "refuses while a subscription is %s and changes nothing",
  async (status) => {
    const { service, storage } = await seed();
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        userId: "u1",
        provider: "fake",
        planId: "monthly",
        amountUsd: 990,
        credits: 60,
        status,
      })
      .returning();

    expect((await service.planDeletion("u1")).activeSubscriptionId).toBe(
      subscription!.id,
    );
    await expect(service.deleteUser("u1")).rejects.toEqual(
      new AccountError("ACTIVE_SUBSCRIPTION"),
    );
    const [kept] = await db.select().from(user).where(eq(user.id, "u1"));
    expect(kept!.email).toBe("ann@example.com");
    expect(await db.select().from(session)).toHaveLength(1);
    expect(await storage.list("uploads/u1/")).toHaveLength(1);
  },
);

it("allows deletion once the subscription has ended", async () => {
  const { service } = await seed();
  await db.insert(subscriptions).values({
    userId: "u1",
    provider: "fake",
    planId: "monthly",
    amountUsd: 990,
    credits: 60,
    status: "CANCELED",
  });
  await expect(service.deleteUser("u1")).resolves.toMatchObject({
    alreadyDeleted: false,
  });
  expect(await db.select().from(subscriptions)).toHaveLength(1);
});

it("reports an unknown user", async () => {
  const { service } = await seed();
  await expect(service.exportUser("nobody")).rejects.toEqual(
    new AccountError("USER_NOT_FOUND"),
  );
  await expect(service.deleteUser("nobody")).rejects.toEqual(
    new AccountError("USER_NOT_FOUND"),
  );
});
