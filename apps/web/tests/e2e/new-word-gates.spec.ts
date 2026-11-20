import { expect, test } from "@playwright/test";

import { newWords } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// The automatic gates (docs/product/keyword-pool.md#gates), written here as a deep check
// writes them: estimated searches, the top 30, a knockout and the word's own domains.
test("a new word shows its estimated searches and automatic gates", async ({
  page,
  context,
}) => {
  await signIn(context);
  const phrase = `gates word ${Date.now()}`;
  const [word] = await testDb()
    .insert(newWords)
    .values({
      phrase,
      verdict: "skip",
      checkedAt: new Date(),
      ratio: 0.2,
      reasons: [
        { code: "hot", value: 0.2 },
        { code: "window_closed", value: 62 },
      ],
      gates: {
        monthly: 1080,
        peakDrop: 0.62,
        top10New: 1,
        top30Under12: 2,
        top30Under24: 6,
        top30Unknown: 1,
        clustered: true,
        brandsTop10: 2,
        oldExactTop5: null,
        features: ["ai_overview", "video"],
        exactDomains: [
          { domain: "gatesword.com", registeredOn: "2026-11-15", free: false },
          { domain: "gatesword.net", registeredOn: null, free: true },
        ],
        knockouts: ["window_closed"],
      },
    })
    .returning();

  await page.goto(`/discover/${word.id}`);
  await expect(page.getByText("约 1,080/月").first()).toBeVisible();
  const gates = page.getByTestId("word-gates");
  await expect(gates).toContainText("约 1,080/月，不满足");
  await expect(gates).toContainText("62%");
  await expect(gates).toContainText("扎堆");
  await expect(gates).toContainText("AI 概览、视频");
  await expect(gates).toContainText("gatesword.com 已注册（2026-11-15）");
  await expect(gates).toContainText("gatesword.net 未注册");
  await expect(gates).toContainText("窗口已关");
  await expect(page.getByText("热度已从顶点回落 62%").first()).toBeVisible();
});
