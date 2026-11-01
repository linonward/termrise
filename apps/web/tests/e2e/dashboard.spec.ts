import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createCreditService } from "@repo/credits/credit-service";
import {
  newWordRoots,
  newWords,
  platformSiteMonths,
  poolChecks,
  poolKeywords,
  platformSites,
  tasks,
} from "@repo/db/schema";
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
test("a new word shows why it rose, with its evidence, and filters by cause", async ({
  page,
  context,
}) => {
  await signIn(context);
  const phrase = `lumo edit ${randomUUID().slice(0, 6)}`;
  const [word] = await testDb()
    .insert(newWords)
    .values({
      phrase,
      verdict: "worth",
      buildAs: "new_site",
      checkedAt: new Date(),
      firstDay: "2026-10-12",
      burstDay: "2026-10-14",
      growth7: 34.5,
      originType: "model_release",
      originSummary: "2026-10-14 Hugging Face 上发布 Lumo-Edit，搜索随后起量。",
      originCapture: "做在线试用页。",
      originEvidence: [
        {
          source: "hugging_face",
          kind: "model",
          title: "lumo/Lumo-Edit",
          url: "https://huggingface.co/lumo/Lumo-Edit",
          at: "2026-10-14T00:00:00.000Z",
          score: 1200,
          cited: true,
          first: true,
        },
      ],
      originCheckedAt: new Date(),
      serp: [
        {
          rank: 1,
          url: "https://huggingface.co/lumo/Lumo-Edit",
          title: phrase,
          site: "huggingface.co",
          type: "organic",
        },
      ],
    })
    .returning();
  const fresh = `fresh name ${randomUUID().slice(0, 6)}`;
  const [unscreened] = await testDb()
    .insert(newWords)
    .values({ phrase: fresh, priority: 5, releasedOn: "2026-10-30" })
    .returning();
  await testDb()
    .insert(newWordRoots)
    .values({ wordId: unscreened.id, root: "source:itch_io" });
  await page.goto("/discover");
  await expect(
    page.getByRole("heading", { level: 1, name: "发现" }),
  ).toBeVisible();
  const stages = page.getByRole("navigation", { name: "按阶段筛选" });
  // Words waiting for a decision come first; the rest of the pipeline is a click away.
  await expect(stages.getByRole("link", { name: /待你决定/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await stages.getByRole("link", { name: /待初筛/ }).click();
  await expect(page).toHaveURL(/stage=screen/);
  await expect(
    page.getByTestId("new-word-row").filter({ hasText: fresh }),
  ).toContainText("来自 itch.io 新游戏 · 10/30 发布");
  await expect(
    page.getByTestId("new-word-row").filter({ hasText: fresh }),
  ).toContainText("优先级 5");
  await stages.getByRole("link", { name: /待你决定/ }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await page.getByLabel("按起因筛选").selectOption("model_release");
  await page.getByRole("button", { name: "应用" }).click();
  await expect(page).toHaveURL(/origin=model_release/);
  const row = page.getByTestId("new-word-row").filter({ hasText: phrase });
  await expect(row).toContainText("起因：2026-10-14 Hugging Face 上发布");
  await expect(row).toContainText("10/12 出现 · 10/14 起量");
  await expect(row).toContainText("自身近 7 天 +3,450%");
  await page.goto(`/discover/${word.id}`);
  await expect(
    page.getByRole("heading", { level: 2, name: "起因" }),
  ).toBeVisible();
  await expect(page.getByText("做在线试用页。")).toBeVisible();
  // The model's own page on Hugging Face is listed, not counted as competition.
  await expect(page.getByText("官方或平台，不算竞争")).toBeVisible();
  for (const name of ["热度与走势", "竞争", "承接"])
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "在谷歌趋势里打开" }),
  ).toHaveAttribute("href", /^https:\/\/trends\.google\.com\/explore\?q=/);
  await page.getByRole("link", { name: "新词 · 待你决定" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await page.goto(`/discover/${word.id}`);
  const evidence = page.getByTestId("origin-evidence");
  await expect(evidence).toContainText("最早");
  await expect(evidence).toContainText("1,200 赞");
  await expect(
    evidence.getByRole("link", { name: "lumo/Lumo-Edit" }),
  ).toHaveAttribute("href", "https://huggingface.co/lumo/Lumo-Edit");
});

test("an imported keyword says its numbers wait for a Termrise check and can be measured again", async ({
  page,
  context,
}) => {
  await signIn(context);
  const phrase = `bond savings calculator ${randomUUID().slice(0, 6)}`;
  const [keyword] = await testDb()
    .insert(poolKeywords)
    .values({
      phrase,
      sources: ["suffix:calculator"],
      status: "candidate",
      searchVolume: 27100,
      keywordDifficulty: 1,
      lastCheckedAt: new Date(),
    })
    .returning();
  await testDb()
    .insert(poolChecks)
    .values({
      keywordId: keyword.id,
      kind: "import",
      status: "candidate",
      rules: "tool-site-v1",
      data: {
        keywordLab: {
          date: "2026-10-31",
          round: "keyword-research-20261031-calculator.csv",
          reason: 'checked as "savings bond calculator": H5 0 strong',
        },
      },
    });
  await page.goto(`/keywords/${keyword.id}`);
  await expect(
    page.getByText("这个词的数字来自旧数据导入，还没有用 Termrise 测过"),
  ).toBeVisible();
  // keyword-lab's own wording is not shown.
  await expect(page.getByText(/keyword-lab/)).toHaveCount(0);
  await page.getByRole("button", { name: /用 Termrise 重新测/ }).click();
  await expect(page.getByRole("status")).toContainText(/已排队|有一轮在进行/);
});

test("platform sites list monthly visits and can be hidden", async ({
  page,
  context,
}) => {
  await signIn(context);
  const name = `e2e-${randomUUID().slice(0, 8)}`;
  const month = new Date().toISOString().slice(0, 7);
  const [site] = await testDb()
    .insert(platformSites)
    .values({
      host: `${name}.vercel.app`,
      platform: "vercel.app",
      firstCrawl: "CC-MAIN-2026-43",
      etv: 987_654,
      checkedAt: new Date(),
      topKeyword: "cipher decoder",
      topKeywordVolume: 6600,
      topKeywordRank: 3,
      keywordCheckedAt: new Date(),
      pageTitle: "Cipher Decoder",
    })
    .returning();
  await testDb()
    .insert(platformSiteMonths)
    .values({ siteId: site.id, month, etv: 987_654 });
  await page.goto("/discover");
  await page
    .getByRole("navigation", { name: "发现分类" })
    .getByRole("link", { name: /平台站/ })
    .click();
  await expect(page).toHaveURL(/\/discover\/platforms$/);
  await expect(
    page
      .getByRole("navigation", { name: "发现分类" })
      .getByRole("link", { name: /平台站/ }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("columnheader", { name: month })).toBeVisible();
  const row = page.getByTestId("platform-site-row").filter({ hasText: name });
  await expect(row).toContainText("cipher decoder");
  await expect(row).toContainText("987,654");
  await row.getByRole("button", { name: `隐藏 ${name}.vercel.app` }).click();
  await expect(row).toHaveCount(0);
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
