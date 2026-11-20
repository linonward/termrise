import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { watchPages, watchSources } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createSiteWatch } from "./site-watch";

const db = testDb();
let clock = new Date("2026-11-20T08:00:00Z");

// A tiny web: a.com lists its tools in a sitemap; b.com has a blog category feed.
const web = new Map<string, string>();
const fake = (async (input: string | URL | Request) => {
  const url = String(input);
  const body = web.get(url);
  return body === undefined
    ? new Response("", { status: 404 })
    : new Response(body, { status: 200 });
}) as typeof fetch;
const sitemap = (paths: string[]) =>
  `<urlset>${paths.map((p) => `<url><loc>https://a.com${p}</loc><lastmod>2026-11-19</lastmod></url>`).join("")}</urlset>`;
const feed = (slugs: string[]) =>
  `<rss><channel>${slugs.map((s) => `<item><title>${s}</title><link>https://b.com/blog/${s}/</link><pubDate>Wed, 19 Nov 2026 10:00:00 +0000</pubDate></item>`).join("")}</channel></rss>`;

const watch = () =>
  createSiteWatch({ database: db, fetch: fake, now: () => clock });

beforeEach(async () => {
  await resetDb();
  clock = new Date("2026-11-20T08:00:00Z");
  web.clear();
  web.set("https://a.com/robots.txt", "Sitemap: https://a.com/sitemap.xml");
  web.set("https://a.com/tools/", "<html></html>");
  web.set("https://a.com/sitemap.xml", sitemap(["/", "/tools/old-tool-maker"]));
  web.set("https://b.com/blog/ai/", "<html></html>");
  web.set("https://b.com/blog/ai/feed/", feed(["how-to-make-old-thing"]));
  web.set(
    "https://a.com/tools/goodbye-gta-5-ai-video-generator",
    "<title>Goodbye GTA 5 AI Video Generator</title>",
  );
});
afterAll(closeTestDb);

it("records the pages already there, then hands over new ones once", async () => {
  const w = watch();
  await w.add({ url: "a.com/tools" });
  await w.add({ url: "https://b.com/blog/ai/" });
  // First scan: the baseline, nothing new.
  expect(await w.names(20)).toEqual([]);
  const sources = await db.select().from(watchSources);
  expect(sources.map((s) => [s.prefix, s.method, s.pagesKnown]).sort()).toEqual(
    [
      ["https://a.com/tools/", "sitemap", 1],
      ["https://b.com/blog/ai/", "feed", 1],
    ],
  );

  // Both sites add a page for the same search: it is hotter.
  web.set(
    "https://a.com/sitemap.xml",
    sitemap([
      "/",
      "/tools/old-tool-maker",
      "/tools/goodbye-gta-5-ai-video-generator",
    ]),
  );
  web.set(
    "https://b.com/blog/ai/feed/",
    feed(["how-to-make-goodbye-gta-5-ai-video", "how-to-make-old-thing"]),
  );
  clock = new Date("2026-11-20T11:00:00Z");
  expect(await w.names(20)).toEqual([
    {
      name: "goodbye gta 5 ai video",
      heat: 3,
      releasedAt: expect.stringMatching(/^2026-11-19/),
    },
  ]);
  const [page] = await db
    .select()
    .from(watchPages)
    .where(
      eq(
        watchPages.url,
        "https://a.com/tools/goodbye-gta-5-ai-video-generator",
      ),
    );
  expect(page).toMatchObject({
    baseline: false,
    title: "Goodbye GTA 5 AI Video Generator",
    phrase: "goodbye gta 5 ai video",
  });
  // Handed over once.
  expect(await w.names(20)).toEqual([]);

  const { pages } = await w.overview();
  expect(pages.map((p) => p.phrase)).toEqual([
    "goodbye gta 5 ai video",
    "goodbye gta 5 ai video",
  ]);
});

it("keeps scanning the rest when a site fails, and says why", async () => {
  const w = watch();
  await w.add({ url: "c.com/apps/" });
  await w.add({ url: "a.com/tools/" });
  expect(await w.scan()).toEqual({ sources: 2, fresh: 0, failed: 1 });
  const [c] = await db
    .select()
    .from(watchSources)
    .where(eq(watchSources.prefix, "https://c.com/apps/"));
  expect(c).toMatchObject({ method: null, lastError: "no pages found" });
});

it("adds a section once and removes it with its pages", async () => {
  const w = watch();
  const first = await w.add({ url: "a.com/tools" });
  expect(first.created).toBe(true);
  expect((await w.add({ url: "https://a.com/tools/" })).created).toBe(false);
  await expect(w.add({ url: "nope" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await w.scan();
  await w.remove(first.source.id);
  expect(await db.select().from(watchPages)).toEqual([]);
  await expect(w.remove(first.source.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

it("a cross-check site makes a signal word hotter, old pages too, and makes no words", async () => {
  web.set("https://c.com/robots.txt", "Sitemap: https://c.com/sitemap.xml");
  web.set("https://c.com/", "<html></html>");
  const cSitemap = (paths: string[]) =>
    `<urlset>${paths.map((p) => `<url><loc>https://c.com${p}</loc></url>`).join("")}</urlset>`;
  // c.com already has a page on the trend before anyone watches it.
  web.set(
    "https://c.com/sitemap.xml",
    cSitemap(["/app/gta-5-goodbye-farewell"]),
  );
  const w = watch();
  await w.add({ url: "a.com/tools/" });
  const c = await w.add({ url: "c.com/", role: "confirm" });
  expect(c.source.role).toBe("confirm");
  await w.scan();

  web.set(
    "https://a.com/sitemap.xml",
    sitemap([
      "/",
      "/tools/old-tool-maker",
      "/tools/goodbye-gta-5-ai-video-generator",
      "/tools/seaart-ai-video-generator",
    ]),
  );
  web.set(
    "https://c.com/sitemap.xml",
    cSitemap(["/app/gta-5-goodbye-farewell", "/app/brand-new-thing"]),
  );
  const names = await w.names(20);
  expect(names.map((n) => [n.name, n.heat]).sort()).toEqual([
    ["goodbye gta 5 ai video", 3],
    ["seaart ai video", 2],
  ]);
  const { pages } = await w.overview();
  expect(pages.map((p) => [p.phrase, p.alsoOn]).sort()).toEqual([
    ["goodbye gta 5 ai video", ["c.com"]],
    ["seaart ai video", []],
  ]);

  // A section can switch roles.
  const switched = await w.setRole(c.source.id, { role: "signal" });
  expect(switched.role).toBe("signal");
  await expect(w.setRole(c.source.id, { role: "maybe" })).rejects.toMatchObject(
    {
      code: "INVALID_INPUT",
    },
  );
});
