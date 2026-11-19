import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createSites, parseSiteOpsExport } from "@repo/execution/sites";

import { createTestClient } from "../testing/client";

const { call, signIn } = createTestClient();

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("owner@example.com");
  const now = Date.now();
  await createSites({ database: testDb() }).sync(
    parseSiteOpsExport({
      generatedAt: now,
      since: "2026-10-15",
      sites: [
        {
          domain: "cork7game.com",
          name: "Cork7 Game",
          kind: "web",
          template: "web-starter",
        },
      ],
      daily: [
        {
          domain: "cork7game.com",
          day: new Date(now).toISOString().slice(0, 10),
          source: "pvuv",
          data: { pv: 6, uv: 3 },
          fetchedAt: now,
        },
      ],
      uptime: [
        {
          domain: "cork7game.com",
          last: { at: now, status: 200, ms: 400, ok: true },
          checks24h: 288,
          up24h: 288,
          avgMs24h: 400,
        },
      ],
      alerts: [],
      heartbeats: [{ source: "termrise", state: "up", reason: "healthy" }],
    }),
  );
});
afterAll(closeTestDb);

it("lists the sites with their numbers and the workbench heartbeat", async () => {
  const response = await call("/api/sites", { headers: { cookie } });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.items).toEqual([
    expect.objectContaining({
      domain: "cork7game.com",
      alertState: "up",
      summary: expect.objectContaining({ visitors7d: 3 }),
    }),
  ]);
  expect(body.heartbeats).toEqual([
    expect.objectContaining({ source: "termrise", state: "up" }),
  ]);
});

it("shows one site's days and 404s an unknown one", async () => {
  const body = await (
    await call("/api/sites/cork7game.com", { headers: { cookie } })
  ).json();
  expect(body.days).toEqual([
    expect.objectContaining({ pvuv: { pv: 6, uv: 3 } }),
  ]);
  expect(
    (await call("/api/sites/nope.com", { headers: { cookie } })).status,
  ).toBe(404);
});

it("needs a session", async () => {
  expect((await call("/api/sites")).status).toBe(401);
});
