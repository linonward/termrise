import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createCreditService } from "@repo/credits/credit-service";
import { tasks } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import product from "../../../../product.config";
import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// While the product does not charge (product.config.ts billingEnabled), the dashboard has no
// credits and no example paid action; the tests of those run only with billing on.
const PAID = "billing is disabled in product.config.ts";

test("an early access user sees today's work without credits, and needs a session", async ({
  page,
  context,
}) => {
  test.skip(product.billingEnabled, "the paid dashboard is tested below");
  await signIn(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "今天" }),
  ).toBeVisible();
  for (const name of ["新词", "等你确认"])
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  await expect(page.getByTestId("today-spend")).toContainText("本月花费");
  await page.getByRole("main").getByRole("link", { name: "全部新词" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await page.goto("/today");
  await expect(page.getByTestId("nav-credits")).toHaveCount(0);
  await expect(page.getByLabel("文字")).toHaveCount(0);
  for (const path of ["/billing", "/pricing"])
    expect((await page.goto(path))?.status(), path).toBe(404);
  expect(errors).toEqual([]);
  await context.clearCookies();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});
test("new user sees ten credits, live balance updates and needs a session", async ({
  page,
  context,
}) => {
  test.skip(!product.billingEnabled, PAID);
  const { userId } = await signIn(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/today");
  await expect(page).toHaveTitle("Termrise：发现值得做产品的英文上升热词");
  await expect(page.getByTestId("nav-credits")).toHaveText("10 积分");
  await expect(page.getByTestId("credit-balance")).toHaveText("10");
  await expect(page.getByText("还没有运行记录。")).toBeVisible();
  await createCreditService(testDb()).adminAdjust(
    userId,
    5,
    randomUUID(),
    "E2E adjustment",
  );
  await page.reload();
  await expect(page.getByTestId("nav-credits")).toHaveText("15 积分");
  await expect(
    page.getByRole("heading", { level: 1, name: /^欢迎回来/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await context.clearCookies();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});

test("a task uses one credit, and a failed task refunds it", async ({
  page,
  context,
}) => {
  test.skip(!product.billingEnabled, PAID);
  await signIn(context);
  await page.goto("/today");
  const input = page.getByLabel("文字");
  const run = page.getByRole("button", { name: "运行 · 1 积分" });

  await input.fill("hello");
  await run.click();
  // The fake provider uppercases the input.
  await expect(page.getByText("HELLO", { exact: true })).toBeVisible();
  await expect(page.getByTestId("nav-credits")).toHaveText("9 积分");
  await expect(input).toHaveValue("");

  // Input with [fail] makes the fake provider fail.
  await input.fill("x [fail]");
  await run.click();
  await expect(page.getByText("这次运行失败了，积分已退回。")).toBeVisible();
  await expect(page.getByTestId("nav-credits")).toHaveText("9 积分");

  await page.goto("/billing");
  await expect(page.getByText("退回 · 任务失败")).toBeVisible();
});

test("a task without credits asks the user to buy more", async ({
  page,
  context,
}) => {
  test.skip(!product.billingEnabled, PAID);
  const { userId } = await signIn(context);
  await createCreditService(testDb()).adminAdjust(
    userId,
    -10,
    randomUUID(),
    "E2E empty balance",
  );
  await page.goto("/today");
  await page.getByLabel("文字").fill("hello");
  await page.getByRole("button", { name: "运行 · 1 积分" }).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("Credits 不足。");
  await alert.getByRole("link", { name: "购买积分" }).click();
  await expect(page).toHaveURL(/\/billing$/);
});

// A task lost in a crash is refunded on the first load, and that same load shows the refund
// (docs/architecture/tasks.md#stale-tasks).
for (const path of ["/today", "/billing"])
  test(`${path} shows the balance after a stale task is refunded`, async ({
    page,
    context,
  }) => {
    test.skip(!product.billingEnabled, PAID);
    const { userId } = await signIn(context);
    const [task] = await testDb()
      .insert(tasks)
      .values({
        userId,
        status: "PENDING",
        requestId: randomUUID(),
        input: "stuck",
        creditsCost: 1,
        createdAt: new Date(Date.now() - 16 * 60_000),
      })
      .returning();
    await createCreditService(testDb()).debit({
      userId,
      taskId: task.id,
      type: "TASK_DEBIT",
      amount: 1,
      idempotencyKey: `task:${task.id}:debit`,
    });
    await page.goto(path);
    await expect(page.getByTestId("nav-credits")).toHaveText("10 积分");
  });

// The proxy only checks that a session cookie exists; the layout validates it
// and returns the visitor to the same page after sign-in.
for (const path of ["/today", "/billing"])
  test(`${path} sends a forged session cookie to sign-in`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "forged.value",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto(path);
    await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(path)}`);
  });
