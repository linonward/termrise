import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// Agent tokens (docs/product/ux.md#agent-tokens): the whole token appears once, the list
// keeps only its start, and a revoked token says so.
test("creates an agent token, shows it once and revokes it", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/settings/agents");
  await expect(page.getByText("还没有令牌")).toBeVisible();

  await page.getByLabel("名字").fill("Claude Code");
  await page.getByRole("button", { name: "创建令牌" }).click();
  const token = (await page.getByTestId("new-agent-token").textContent()) ?? "";
  expect(token).toMatch(/^trk_[A-Za-z0-9_-]{43}$/);
  const row = page.getByRole("row", { name: /Claude Code/ });
  await expect(row).toContainText(`${token.slice(0, 12)}…`);
  await expect(row).toContainText("没用过");

  await page.reload();
  await expect(page.getByTestId("new-agent-token")).toHaveCount(0);
  await expect(page.getByText(token)).toHaveCount(0);

  await row.getByRole("button", { name: "撤销" }).click();
  await expect(row).toContainText("已撤销");
});

test("agent tokens need a session", async ({ page }) => {
  await page.goto("/settings/agents");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fagents$/);
});
