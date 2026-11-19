import { afterAll, beforeEach, expect, it } from "vitest";

import { siteDailyMetrics, sites } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createSites, parseSiteOpsExport } from "./sites";

const db = testDb();
const service = createSites({ database: db });
const now = new Date("2026-11-19T12:00:00Z");

const exportWith = (
  domains: string[],
  daily: { domain: string; day: string; source: string; data: unknown }[] = [],
) =>
  parseSiteOpsExport({
    generatedAt: now.getTime(),
    since: "2026-10-15",
    sites: domains.map((d) => ({
      domain: d,
      name: d.toUpperCase(),
      kind: "web",
      template: "web-starter",
    })),
    daily: daily.map((r) => ({ ...r, fetchedAt: now.getTime() - 3600_000 })),
    uptime: domains.map((d) => ({
      domain: d,
      last: {
        domain: d,
        at: now.getTime() - 60_000,
        status: 200,
        ms: 400,
        ok: true,
      },
      checks24h: 288,
      up24h: 286,
      avgMs24h: 512.7,
    })),
    alerts: [
      { key: domains[0], state: "down", since: now.getTime() - 600_000 },
      { key: "heartbeat:termrise", state: "up", since: 1 },
    ],
    heartbeats: [{ source: "termrise", state: "up", reason: "healthy" }],
  });

beforeEach(resetDb);
afterAll(closeTestDb);

it("copies the sites, their uptime and alert state, and the daily numbers", async () => {
  await service.sync(
    exportWith(
      ["a.com", "b.com"],
      [
        {
          domain: "a.com",
          day: "2026-11-18",
          source: "pvuv",
          data: { pv: 6, uv: 3 },
        },
        {
          domain: "a.com",
          day: "2026-11-18",
          source: "gsc",
          data: { clicks: 3, impressions: 2105, ctr: 0.0014, position: 48 },
        },
      ],
    ),
    now,
  );
  const list = await service.list(now);
  expect(list.map((s) => s.domain)).toEqual(["a.com", "b.com"]);
  expect(list[0]).toMatchObject({
    name: "A.COM",
    template: "web-starter",
    uptime24h: { checks: 288, up: 286, avgMs: 513 },
    lastOk: true,
    alertState: "down",
    summary: {
      visitors7d: 3,
      pageviews7d: 6,
      search: { clicks: 3, impressions: 2105 },
    },
  });
  expect(list[1].alertState).toBe("up");
  expect(await service.heartbeats()).toEqual([
    expect.objectContaining({ source: "termrise", state: "up" }),
  ]);
});

it("updates in place, and marks a site that left site-ops as removed", async () => {
  await service.sync(
    exportWith(
      ["a.com", "b.com"],
      [{ domain: "a.com", day: "2026-11-18", source: "pvuv", data: { uv: 1 } }],
    ),
    now,
  );
  await service.sync(
    exportWith(
      ["a.com"],
      [{ domain: "a.com", day: "2026-11-18", source: "pvuv", data: { uv: 5 } }],
    ),
    now,
  );
  expect((await service.list(now)).map((s) => s.domain)).toEqual(["a.com"]);
  expect(await db.select().from(siteDailyMetrics)).toHaveLength(1);
  const [b] = (await db.select().from(sites)).filter(
    (s) => s.domain === "b.com",
  );
  expect(b.removedAt).toEqual(now);
  await service.sync(exportWith(["a.com", "b.com"]), now);
  expect((await service.list(now)).map((s) => s.domain)).toEqual([
    "a.com",
    "b.com",
  ]);
});

it("ignores daily rows of sites that aren't in the list", async () => {
  await service.sync(
    exportWith(
      ["a.com"],
      [
        {
          domain: "gone.com",
          day: "2026-11-18",
          source: "pvuv",
          data: { uv: 1 },
        },
      ],
    ),
    now,
  );
  expect(await db.select().from(siteDailyMetrics)).toHaveLength(0);
});

it("gives one site's days, newest first, and nothing for an unknown domain", async () => {
  await service.sync(
    exportWith(
      ["a.com"],
      [
        { domain: "a.com", day: "2026-11-17", source: "pvuv", data: { uv: 2 } },
        { domain: "a.com", day: "2026-11-18", source: "pvuv", data: { uv: 3 } },
      ],
    ),
    now,
  );
  const detail = await service.detail("a.com", now);
  expect(detail?.days.map((d) => d.day)).toEqual(["2026-11-18", "2026-11-17"]);
  expect(detail?.days[0].pvuv).toEqual({ uv: 3 });
  expect(await service.detail("nope.com", now)).toBeNull();
});
