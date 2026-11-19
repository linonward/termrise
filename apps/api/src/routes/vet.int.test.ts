import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createSites, parseSiteOpsExport } from "@repo/execution/sites";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

// Vetting records written by an agent with its token (docs/product/keyword-pool.md#vet),
// and what Today shows: sites that are down, the heartbeat, keywords to look at again.
const { call, signIn } = createTestClient();

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("owner@example.com");
});
afterAll(closeTestDb);

const json = (body: unknown) => ({
  "Content-Type": "application/json",
  body: JSON.stringify(body),
});

it("an agent writes a vet record with its token; the keyword shows it", async () => {
  const created = await call("/api/settings/agent-tokens", {
    method: "POST",
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Claude Code" }),
  });
  const { token } = (await created.json()) as { token: string };
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const { body } = json({
    phrase: "apkstart",
    verdict: "watch",
    score: { total: 54, max: 90 },
    summary: "观察：美国约 300/月，峰值已过。",
    markdown: "# 选词简报：apkstart",
    recheck: [soon],
  });
  const response = await call("/api/pool/keywords/vet", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body,
  });
  expect(response.status).toBe(201);
  const keyword = (await response.json()) as {
    id: string;
    status: string;
    reviewAt: string;
  };
  expect(keyword.status).toBe("watch");
  expect(keyword.reviewAt.slice(0, 10)).toBe(soon);

  const detail = await (
    await call(`/api/pool/keywords/${keyword.id}`, { headers: { cookie } })
  ).json();
  expect(detail.checks[0]).toMatchObject({
    kind: "vet",
    data: { verdict: "watch", markdown: "# 选词简报：apkstart" },
  });

  const today = await (
    await call("/api/today", { headers: { cookie } })
  ).json();
  expect(today.reviews).toEqual([
    expect.objectContaining({
      phrase: "apkstart",
      status: "watch",
      due: false,
    }),
  ]);
});

it("refuses a bad vet record and needs a session or token", async () => {
  const bad = await call("/api/pool/keywords/vet", {
    method: "POST",
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phrase: "x", verdict: "maybe", summary: "s" }),
  });
  expect(bad.status).toBe(400);
  const anonymous = await call("/api/pool/keywords/vet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phrase: "x", verdict: "drop", summary: "s" }),
  });
  expect(anonymous.status).toBe(401);
});

it("Today lists the sites that are down and the heartbeats", async () => {
  const now = Date.now();
  const site = (domain: string) => ({ domain, name: domain, kind: "web" });
  const up = (domain: string, ok: boolean) => ({
    domain,
    last: { at: now, status: ok ? 200 : 503, ms: 300, ok },
    checks24h: 288,
    up24h: ok ? 288 : 280,
    avgMs24h: 300,
  });
  await createSites({ database: testDb() }).sync(
    parseSiteOpsExport({
      generatedAt: now,
      since: "2026-10-15",
      sites: [site("a.com"), site("b.com")],
      daily: [],
      uptime: [up("a.com", true), up("b.com", false)],
      alerts: [{ key: "b.com", state: "down", since: now - 600_000 }],
      heartbeats: [
        { source: "termrise", state: "down", reason: "no round in 36h" },
      ],
    }),
  );
  const today = await (
    await call("/api/today", { headers: { cookie } })
  ).json();
  expect(today.sites).toMatchObject({
    total: 2,
    down: [{ domain: "b.com", lastStatus: 503 }],
  });
  expect(today.sites.syncedAt).toEqual(expect.any(String));
  expect(today.heartbeats).toEqual([
    { source: "termrise", state: "down", reason: "no round in 36h" },
  ]);
});
