import { afterAll, beforeEach, expect, it } from "vitest";

import { domains } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createSites, parseSiteOpsExport } from "@repo/execution/sites";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

// Payments and domain expiry (docs/architecture/data-model.md#expenses).
const { call, signIn } = createTestClient();

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("owner@example.com");
});
afterAll(closeTestDb);

it("an agent records a payment with its token; the month and Today total it", async () => {
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
  const today = new Date().toISOString().slice(0, 10);
  const response = await call("/api/expenses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paidOn: today,
      amountMinor: 1250,
      currency: "USD",
      category: "data",
      note: "DataForSEO top-up",
    }),
  });
  expect(response.status).toBe(201);
  const { id } = (await response.json()) as { id: string };

  const month = await (
    await call("/api/expenses", { headers: { cookie } })
  ).json();
  expect(month).toMatchObject({
    month: today.slice(0, 7),
    items: [{ id, amountMinor: 1250, note: "DataForSEO top-up" }],
    totals: [{ currency: "USD", amountMinor: 1250 }],
  });
  const t = await (await call("/api/today", { headers: { cookie } })).json();
  expect(t.expenses).toEqual([{ currency: "USD", amountMinor: 1250 }]);

  const removed = await call(`/api/expenses/${id}`, {
    method: "DELETE",
    headers: { cookie, Origin: TEST_APP_URL },
  });
  expect(removed.status).toBe(204);
  const again = await call(`/api/expenses/${id}`, {
    method: "DELETE",
    headers: { cookie, Origin: TEST_APP_URL },
  });
  expect(again.status).toBe(404);
});

it("refuses a bad payment, and needs a session or token", async () => {
  const bad = await call("/api/expenses", {
    method: "POST",
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paidOn: "x",
      amountMinor: 1,
      currency: "USD",
      category: "data",
    }),
  });
  expect(bad.status).toBe(400);
  expect((await call("/api/expenses")).status).toBe(401);
  expect((await call("/api/sites/domains")).status).toBe(401);
});

it("lists domain expiry, and Today shows the ones within 30 days", async () => {
  const now = Date.now();
  await createSites({ database: testDb() }).sync(
    parseSiteOpsExport({
      generatedAt: now,
      since: "2026-10-15",
      sites: ["soon.example", "later.example"].map((domain) => ({
        domain,
        name: domain,
        kind: "web",
      })),
      daily: [],
      uptime: [],
      alerts: [],
      heartbeats: [],
    }),
  );
  await testDb()
    .insert(domains)
    .values([
      {
        domain: "soon.example",
        expiresAt: new Date(now + 10.5 * 86_400_000),
        checkedAt: new Date(now),
      },
      {
        domain: "later.example",
        expiresAt: new Date(now + 200.5 * 86_400_000),
        registrar: "Cloudflare, Inc.",
        checkedAt: new Date(now),
      },
    ]);
  const list = await (
    await call("/api/sites/domains", { headers: { cookie } })
  ).json();
  expect(
    list.items.map((d: { domain: string; daysLeft: number }) => [
      d.domain,
      d.daysLeft,
    ]),
  ).toEqual([
    ["soon.example", 10],
    ["later.example", 200],
  ]);
  const t = await (await call("/api/today", { headers: { cookie } })).json();
  expect(t.domainsExpiring).toEqual([
    expect.objectContaining({ domain: "soon.example", daysLeft: 10 }),
  ]);
});
