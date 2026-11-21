import { expect, test } from "@playwright/test";

import { newWords } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// New words' times (docs/product/keyword-pool.md#new-words, S89): the update day on
// each row, a stale mark on old decisions, and a sort the page keeps.
test("shows when a decision was updated, marks stale ones and sorts by a chosen time", async ({
  page,
  context,
}) => {
  await signIn(context);
  const stamp = Date.now();
  const day = 86_400_000;
  const stale = `stale decision ${stamp}`;
  const fresh = `fresh decision ${stamp}`;
  await testDb()
    .insert(newWords)
    .values([
      {
        phrase: stale,
        verdict: "worth",
        buildAs: "new_site",
        ratio: 0.2,
        firstSeenAt: new Date(stamp - 6 * day),
        checkedAt: new Date(stamp - 5 * day),
        verdictAt: new Date(stamp - 5 * day),
      },
      {
        phrase: fresh,
        verdict: "worth",
        buildAs: "new_site",
        ratio: 0.2,
        firstSeenAt: new Date(stamp - 10 * day),
        checkedAt: new Date(stamp),
        verdictAt: new Date(stamp),
      },
    ]);

  await page.goto(`/discover?q=${stamp}`);
  const row = (phrase: string) =>
    page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: phrase }) });
  await expect(row(stale).getByTestId("stale")).toContainText("数据已过期");
  await expect(row(fresh).getByTestId("stale")).toHaveCount(0);
  await expect(row(fresh)).toContainText("更新");
  // Default: the newest verdict first. By discovery time, the stale one is newer.
  const links = page.getByRole("link", {
    name: new RegExp(`decision ${stamp}`),
  });
  await expect(links.first()).toHaveText(fresh);
  await page.getByLabel("排序").selectOption("seen");
  await page.getByRole("button", { name: "应用" }).click();
  await expect(page).toHaveURL(/sort=seen/);
  await expect(links.first()).toHaveText(stale);
});
