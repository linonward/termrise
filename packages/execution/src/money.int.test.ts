import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { domains, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createDomains, createExpenses, expiringWithin } from "./money";
import { createSites, parseSiteOpsExport } from "./sites";

const db = testDb();
const now = new Date("2026-11-19T10:00:00Z");

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
  await createSites({ database: db }).sync(
    parseSiteOpsExport({
      generatedAt: now.getTime(),
      since: "2026-10-15",
      sites: ["vivclip.com", "radio.vivclip.com", "cork7game.com"].map(
        (domain) => ({ domain, name: domain, kind: "web" }),
      ),
      daily: [],
      uptime: [],
      alerts: [],
      heartbeats: [],
    }),
    now,
  );
});
afterAll(closeTestDb);

const rdap = (expiration: string) =>
  new Response(
    JSON.stringify({
      events: [{ eventAction: "expiration", eventDate: expiration }],
    }),
    { status: 200 },
  );

it("reads each registrable domain once a day and keeps the last date when a lookup fails", async () => {
  const fetch = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith("vivclip.com")
      ? rdap("2026-12-09T00:00:00Z")
      : rdap("2027-08-01T00:00:00Z"),
  );
  const d = createDomains({
    database: db,
    fetch: fetch as typeof globalThis.fetch,
  });
  expect(await d.refresh(now)).toEqual({ checked: 2, failed: 0 });
  expect(fetch.mock.calls.map((c) => String(c[0])).sort()).toEqual([
    "https://rdap.org/domain/cork7game.com",
    "https://rdap.org/domain/vivclip.com",
  ]);
  // Fresh rows are not looked up again.
  expect(await d.refresh(new Date(now.getTime() + 3_600_000))).toEqual({
    checked: 0,
    failed: 0,
  });

  const list = await d.list(now);
  expect(list.map((r) => [r.domain, r.daysLeft])).toEqual([
    ["vivclip.com", 19],
    ["cork7game.com", 254],
  ]);
  expect(expiringWithin(list).map((r) => r.domain)).toEqual(["vivclip.com"]);

  const failing = createDomains({
    database: db,
    fetch: (async () =>
      new Response("", { status: 503 })) as typeof globalThis.fetch,
  });
  const tomorrow = new Date(now.getTime() + 86_400_000);
  expect(await failing.refresh(tomorrow)).toEqual({ checked: 2, failed: 2 });
  const [row] = (await db.select().from(domains)).filter(
    (r) => r.domain === "vivclip.com",
  );
  expect(row).toMatchObject({
    expiresAt: new Date("2026-12-09T00:00:00Z"),
    error: "http 503",
    checkedAt: tomorrow,
  });
});

it("records payments, totals a month by currency and deletes one", async () => {
  const e = createExpenses({ database: db });
  const first = await e.add("a", {
    paidOn: "2026-11-02",
    amountMinor: 1050,
    currency: "usd",
    category: "domain",
    note: "cork7game.com 1 year",
    domain: "Cork7Game.com",
  });
  expect(first).toMatchObject({ currency: "USD", domain: "cork7game.com" });
  await e.add("a", {
    paidOn: "2026-11-20",
    amountMinor: 2000,
    currency: "USD",
    category: "data",
  });
  await e.add("a", {
    paidOn: "2026-11-21",
    amountMinor: 9900,
    currency: "CNY",
    category: "ai",
  });
  await e.add("a", {
    paidOn: "2026-10-31",
    amountMinor: 500,
    currency: "USD",
    category: "other",
  });

  const nov = await e.month(undefined, now);
  expect(nov.month).toBe("2026-11");
  expect(nov.items.map((x) => x.paidOn)).toEqual([
    "2026-11-21",
    "2026-11-20",
    "2026-11-02",
  ]);
  expect(nov.totals).toEqual([
    { currency: "CNY", amountMinor: 9900 },
    { currency: "USD", amountMinor: 3050 },
  ]);
  expect((await e.month("2026-10", now)).totals).toEqual([
    { currency: "USD", amountMinor: 500 },
  ]);
  // A bad month falls back to this one.
  expect((await e.month("2026-13", now)).month).toBe("2026-11");

  await e.remove(first.id);
  expect((await e.totals("2026-11")).find((x) => x.currency === "USD")).toEqual(
    {
      currency: "USD",
      amountMinor: 2000,
    },
  );
  await expect(e.remove(first.id)).rejects.toMatchObject({
    code: "EXPENSE_NOT_FOUND",
  });
  await expect(e.remove("nope")).rejects.toMatchObject({
    code: "EXPENSE_NOT_FOUND",
  });
});

it("refuses a payment that is not valid", async () => {
  const e = createExpenses({ database: db });
  for (const body of [
    { paidOn: "2026-11-02", amountMinor: 0, currency: "USD", category: "data" },
    {
      paidOn: "2026-11-02",
      amountMinor: 1.5,
      currency: "USD",
      category: "data",
    },
    { paidOn: "11/02", amountMinor: 100, currency: "USD", category: "data" },
    {
      paidOn: "2026-11-02",
      amountMinor: 100,
      currency: "US",
      category: "data",
    },
    {
      paidOn: "2026-11-02",
      amountMinor: 100,
      currency: "USD",
      category: "food",
    },
    {
      paidOn: "2026-11-02",
      amountMinor: 100,
      currency: "USD",
      category: "data",
      domain: "not a domain",
    },
  ])
    await expect(e.add("a", body)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
});
