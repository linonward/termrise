import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createExecutionService } from "@repo/execution/execution-service";
import { createSites, parseSiteOpsExport } from "@repo/execution/sites";
import { createKeywordPool } from "@repo/research/pool-service";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

// A product and a site share a domain (docs/product/ux.md#products): the product shows
// the site's numbers, and the site links back to the product and its keyword.
const { call, signIn } = createTestClient();

let cookie: string;
let other: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("owner@example.com");
  other = await signIn("other@example.com");
  const now = Date.now();
  await createSites({ database: testDb() }).sync(
    parseSiteOpsExport({
      generatedAt: now,
      since: "2026-10-15",
      sites: [{ domain: "cipher.example", name: "Cipher", kind: "tool" }],
      daily: [
        {
          domain: "cipher.example",
          day: new Date(now).toISOString().slice(0, 10),
          source: "pvuv",
          data: { pv: 30, uv: 9 },
          fetchedAt: now,
        },
      ],
      uptime: [],
      alerts: [],
      heartbeats: [],
    }),
  );
});
afterAll(closeTestDb);

async function product(session: string, domain: string | null) {
  const [{ id: userId }] = await testDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "owner@example.com"));
  const keyword = await createKeywordPool({ database: testDb() }).record({
    phrase: `cipher decoder ${Math.random()}`,
    status: "selected",
    reasons: [],
    kind: "review",
  });
  const execution = createExecutionService({ database: testDb() });
  const project = await execution.startFromKeyword(userId, {
    poolKeywordId: keyword.id,
    name: "cipher decoder",
  });
  if (domain)
    await call(`/api/execution/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        cookie: session,
        Origin: TEST_APP_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain }),
    });
  return { id: project.id, keywordId: keyword.id };
}

it("a product whose domain is a live site carries its numbers; the site links back", async () => {
  const { id, keywordId } = await product(cookie, "www.cipher.example");
  const detail = await (
    await call(`/api/execution/projects/${id}`, { headers: { cookie } })
  ).json();
  expect(detail.site).toMatchObject({
    domain: "cipher.example",
    summary: { visitors7d: 9 },
  });

  const site = await (
    await call("/api/sites/cipher.example", { headers: { cookie } })
  ).json();
  expect(site.product).toEqual({
    id,
    name: "cipher decoder",
    status: "not_started",
    poolKeywordId: keywordId,
    newWordId: null,
  });
  // Another user's product is not shown on the site.
  const seen = await (
    await call("/api/sites/cipher.example", { headers: { cookie: other } })
  ).json();
  expect(seen.product).toBeNull();
});

it("a product without a domain, or with one that is not a site, has no site", async () => {
  for (const domain of [null, "elsewhere.example"]) {
    const { id } = await product(cookie, domain);
    const detail = await (
      await call(`/api/execution/projects/${id}`, { headers: { cookie } })
    ).json();
    expect(detail.site).toBeNull();
  }
});
