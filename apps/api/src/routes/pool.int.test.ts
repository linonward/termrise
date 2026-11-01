import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

const { call, signIn } = createTestClient();

let owner: string;
beforeEach(async () => {
  await resetDb();
  owner = await signIn("owner@example.com");
});
afterAll(closeTestDb);

const send = (method: string, path: string, body?: unknown, cookie = owner) =>
  call(path, {
    method,
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

it("needs a signed-in user", async () => {
  expect((await call("/api/pool/keywords")).status).toBe(401);
});

it("adds ideas, lists, reviews and shows a keyword with its checks", async () => {
  const added = await send("POST", "/api/pool/keywords", {
    phrases: ["Cipher Decoder"],
  });
  expect(added.status).toBe(201);
  const [keyword] = (await added.json()).added;
  expect(keyword).toMatchObject({ phrase: "cipher decoder", status: "new" });

  const list = await (
    await send("GET", "/api/pool/keywords?status=new")
  ).json();
  expect(list).toMatchObject({ total: 1, counts: { new: 1 } });

  const refused = await send(
    "POST",
    `/api/pool/keywords/${keyword.id}/review`,
    {
      action: "select",
    },
  );
  expect(refused.status).toBe(409);
  expect((await refused.json()).error.code).toBe("POOL_REVIEW_INVALID");

  const dropped = await send(
    "POST",
    `/api/pool/keywords/${keyword.id}/review`,
    {
      action: "drop",
      note: "not for now",
    },
  );
  expect((await dropped.json()).status).toBe("dropped");

  const detail = await (
    await send("GET", `/api/pool/keywords/${keyword.id}`)
  ).json();
  expect(detail.checks.map((c: { kind: string }) => c.kind)).toEqual([
    "review",
    "review",
  ]);
  expect(detail.checks[0]).not.toHaveProperty("reviewerId");
  const missing = await send(
    "GET",
    "/api/pool/keywords/00000000-0000-4000-8000-000000000000",
  );
  expect((await missing.json()).error.code).toBe("POOL_KEYWORD_NOT_FOUND");
});

it("queues one round and lists it", async () => {
  const first = await send("POST", "/api/pool/rounds", {
    source: "suffix:decoder",
  });
  expect(first.status).toBe(201);
  const again = await send("POST", "/api/pool/rounds", {});
  expect(again.status).toBe(200);
  const { items } = await (await send("GET", "/api/pool/rounds")).json();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    kind: "manual",
    status: "queued",
    spentMicros: 0,
  });
});

it("refuses a form-like write from another origin", async () => {
  // JSON writes need a CORS preflight; a text/plain post does not, so CSRF checks it.
  const res = await call("/api/pool/keywords", {
    method: "POST",
    headers: {
      cookie: owner,
      Origin: "https://evil.example",
      "Content-Type": "text/plain",
    },
    body: JSON.stringify({ phrases: ["x"] }),
  });
  expect(res.status).toBe(403);
});

it("lists new words, shows one with its long tails, and hides it", async () => {
  const { testDb } = await import("@repo/db/testing/db");
  const { newWords, newWordRoots } = await import("@repo/db/schema");
  const db = testDb();
  const [word] = await db
    .insert(newWords)
    .values([
      {
        phrase: "ragdoll robot boxing",
        verdict: "worth",
        buildAs: "new_site",
        ratio: 0.105,
      },
      {
        phrase: "ragdoll robot boxing codes",
        verdict: "try",
        buildAs: "inner_page",
      },
    ])
    .returning();
  await db
    .insert(newWordRoots)
    .values({ wordId: word.id, root: "game", growth: 5000 });

  const list = await (await send("GET", "/api/pool/new-words")).json();
  expect(list.total).toBe(2);
  const detail = await (
    await send("GET", `/api/pool/new-words/${word.id}`)
  ).json();
  expect(detail).toMatchObject({
    phrase: "ragdoll robot boxing",
    innerCandidates: 1,
    roots: [{ root: "game", growth: 5000 }],
  });
  expect(detail.children.map((c: { phrase: string }) => c.phrase)).toEqual([
    "ragdoll robot boxing codes",
  ]);
  expect(
    (await send("PUT", `/api/pool/new-words/${word.id}/hide`)).status,
  ).toBe(200);
  expect((await (await send("GET", "/api/pool/new-words")).json()).total).toBe(
    1,
  );
  const missing = await send(
    "GET",
    "/api/pool/new-words/00000000-0000-4000-8000-000000000000",
  );
  expect((await missing.json()).error.code).toBe("NEW_WORD_NOT_FOUND");
  expect((await send("POST", "/api/pool/new-words/rounds", {})).status).toBe(
    201,
  );
});

it("exports a keyword brief as Markdown", async () => {
  const added = await send("POST", "/api/pool/keywords", {
    phrases: ["cipher decoder"],
  });
  const [keyword] = (await added.json()).added;
  const res = await send("GET", `/api/pool/keywords/${keyword.id}/brief.md`);
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Disposition")).toContain(
    "keyword-brief-cipher-decoder.md",
  );
  expect(await res.text()).toContain("# 选词简报：cipher decoder");
});

it("lists what waits for review", async () => {
  await send("POST", "/api/pool/keywords", { phrases: ["x"] });
  const review = await (
    await send("GET", "/api/pool/keywords?status=review")
  ).json();
  expect(review.total).toBe(0);
  const all = await (await send("GET", "/api/pool/keywords?status=all")).json();
  expect(all.total).toBe(1);
  expect((await send("GET", "/api/today")).status).toBe(200);
});

it("starts a product when a keyword or a new word is selected, once", async () => {
  const { testDb } = await import("@repo/db/testing/db");
  const { newWords } = await import("@repo/db/schema");
  const { createKeywordPool } = await import("@repo/research/pool-service");
  const db = testDb();
  const keyword = await createKeywordPool({ database: db }).record({
    phrase: "cipher decoder",
    status: "candidate",
    reasons: [],
    kind: "deep",
  });
  const selected = await (
    await send("POST", `/api/pool/keywords/${keyword.id}/review`, {
      action: "select",
    })
  ).json();
  expect(selected).toMatchObject({
    status: "selected",
    productId: expect.any(String),
  });
  const product = await (
    await send("GET", `/api/execution/projects/${selected.productId}`)
  ).json();
  expect(product).toMatchObject({
    name: "cipher decoder",
    poolKeywordId: keyword.id,
    status: "not_started",
  });

  const [word] = await db
    .insert(newWords)
    .values({ phrase: "store stock checker" })
    .returning();
  const first = await (
    await send("POST", `/api/pool/new-words/${word.id}/select`, {})
  ).json();
  const again = await (
    await send("POST", `/api/pool/new-words/${word.id}/select`, {})
  ).json();
  expect(again.productId).toBe(first.productId);
  const brief = await send("GET", `/api/pool/new-words/${word.id}/brief.md`);
  expect(await brief.text()).toContain(
    "# 选词简报：store stock checker（新词）",
  );
});

it("lists launch sites and hides one", async () => {
  const { testDb } = await import("@repo/db/testing/db");
  const { launchSites } = await import("@repo/db/schema");
  const [site] = await testDb()
    .insert(launchSites)
    .values({
      source: "hacker_news",
      sourceId: "101",
      sourceUrl: "https://news.ycombinator.com/item?id=101",
      site: "cursedcam.com",
      url: "https://cursedcam.com",
      postTitle: "Cursed Cam",
      motive: "own_pain",
    })
    .returning();
  const list = await (await send("GET", "/api/pool/launch-sites")).json();
  expect(list).toMatchObject({ total: 1, counts: { own_pain: 1 } });
  expect(
    (await send("PUT", `/api/pool/launch-sites/${site.id}/hide`)).status,
  ).toBe(200);
  expect(
    (await (await send("GET", "/api/pool/launch-sites")).json()).total,
  ).toBe(0);
});

it("lists platform sites with their months and hides one", async () => {
  const { testDb } = await import("@repo/db/testing/db");
  const { platformSites, platformSiteMonths } = await import("@repo/db/schema");
  const db = testDb();
  const [site] = await db
    .insert(platformSites)
    .values({
      host: "cipher-decoder.vercel.app",
      platform: "vercel.app",
      firstCrawl: "CC-MAIN-2026-43",
      etv: 1800,
      checkedAt: new Date(),
      topKeyword: "cipher decoder",
      keywordCheckedAt: new Date(),
    })
    .returning();
  const month = new Date().toISOString().slice(0, 7);
  await db
    .insert(platformSiteMonths)
    .values({ siteId: site.id, month, etv: 1800 });
  const list = await (await send("GET", "/api/pool/platform-sites")).json();
  expect(list).toMatchObject({
    total: 1,
    counts: { "vercel.app": 1 },
    known: 1,
    checked: 1,
    items: [
      {
        host: "cipher-decoder.vercel.app",
        topKeyword: "cipher decoder",
        keywordChecked: true,
        monthly: { [month]: 1800 },
      },
    ],
  });
  expect(list.months.at(-1)).toBe(month);
  expect(
    (await send("PUT", `/api/pool/platform-sites/${site.id}/hide`)).status,
  ).toBe(200);
  expect(
    (await (await send("GET", "/api/pool/platform-sites")).json()).total,
  ).toBe(0);
  expect(
    (await send("PUT", "/api/pool/platform-sites/not-a-uuid/hide")).status,
  ).toBe(404);
});

it("queues a recheck of one keyword", async () => {
  const added = await send("POST", "/api/pool/keywords", {
    phrases: ["bond savings calculator"],
  });
  const [keyword] = (await added.json()).added;
  const res = await send(
    "POST",
    `/api/pool/keywords/${keyword.id}/recheck`,
    {},
  );
  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({
    kind: "manual",
    source: "recheck:bond savings calculator",
    status: "queued",
  });
  expect(
    (await send("POST", "/api/pool/keywords/not-a-uuid/recheck", {})).status,
  ).toBe(404);
});

it("counts what each discover tab shows", async () => {
  const { testDb } = await import("@repo/db/testing/db");
  const { launchSites, newWords, platformSites } =
    await import("@repo/db/schema");
  const db = testDb();
  await db
    .insert(newWords)
    .values([
      { phrase: "cipher decoder" },
      { phrase: "old word", hiddenAt: new Date() },
    ]);
  await db.insert(launchSites).values({
    source: "hacker_news",
    sourceId: "102",
    sourceUrl: "https://news.ycombinator.com/item?id=102",
    site: "cursedcam.com",
    url: "https://cursedcam.com",
    postTitle: "Cursed Cam",
  });
  await db.insert(platformSites).values([
    {
      host: "a.vercel.app",
      platform: "vercel.app",
      firstCrawl: "C",
      etv: 1800,
    },
    // No traffic yet: not on the tab.
    { host: "b.vercel.app", platform: "vercel.app", firstCrawl: "C", etv: 0 },
  ]);
  expect(await (await send("GET", "/api/pool/discover")).json()).toEqual({
    words: 1,
    sites: 1,
    platforms: 1,
  });
});
