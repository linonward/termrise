import { describe, expect, it } from "vitest";

import { parseSiteOpsExport, summarize } from "./sites";

const day = (d: string, source: string, data: unknown) => ({
  day: d,
  source,
  data,
});

describe("site summary", () => {
  it("adds pvuv over 7 days, takes the latest Search Console totals and sums 30 days of orders by currency", () => {
    const rows = [
      day("2026-11-10", "pvuv", { pv: 100, uv: 50 }), // more than 7 days before
      day("2026-11-13", "pvuv", { pv: 10, uv: 4 }),
      day("2026-11-18", "pvuv", { pv: 6, uv: 3 }),
      day("2026-11-17", "gsc", {
        clicks: 2,
        impressions: 900,
        ctr: 0.002,
        position: 50,
      }),
      day("2026-11-18", "gsc", {
        clicks: 3,
        impressions: 2105,
        ctr: 0.0014,
        position: 48.07,
      }),
      day("2026-10-01", "admin", {
        orders: { paid: 9, revenue: [{ currency: "usd", amount: 9900 }] },
      }),
      day("2026-11-17", "admin", {
        orders: { paid: 1, revenue: [{ currency: "usd", amount: 499 }] },
      }),
      day("2026-11-18", "admin", {
        orders: {
          paid: 2,
          revenue: [
            { currency: "usd", amount: 998 },
            { currency: "eur", amount: 300 },
          ],
        },
      }),
    ];
    expect(summarize(rows, "2026-11-19")).toEqual({
      visitors7d: 7,
      pageviews7d: 16,
      search: {
        day: "2026-11-18",
        clicks: 3,
        impressions: 2105,
        position: 48.07,
      },
      orders30d: 3,
      revenue30d: [
        { currency: "EUR", amountMinor: 300 },
        { currency: "USD", amountMinor: 1497 },
      ],
    });
  });

  it("reports nothing it doesn't have", () => {
    expect(summarize([], "2026-11-19")).toEqual({
      visitors7d: null,
      pageviews7d: null,
      search: null,
      orders30d: null,
      revenue30d: [],
    });
  });
});

describe("site-ops export", () => {
  const valid = {
    generatedAt: 1795096787856,
    since: "2026-10-15",
    sites: [
      {
        domain: "cork7game.com",
        name: "Cork7 Game",
        kind: "web",
        repo: "cork7game",
        pvuv: "CxVfBBPb",
        template: "web-starter",
      },
    ],
    daily: [
      {
        domain: "cork7game.com",
        day: "2026-11-18",
        source: "pvuv",
        data: { pv: 2 },
        fetchedAt: 1,
      },
    ],
    uptime: [
      {
        domain: "cork7game.com",
        last: {
          domain: "cork7game.com",
          at: 1,
          status: 200,
          ms: 500,
          ok: true,
        },
        checks24h: 288,
        up24h: 287,
        avgMs24h: 612.4,
      },
    ],
    alerts: [{ key: "cork7game.com", state: "up", since: 1 }],
    heartbeats: [{ source: "termrise", state: "up", reason: "healthy" }],
  };

  it("accepts site-ops's export and drops daily rows of unknown sources", () => {
    const parsed = parseSiteOpsExport({
      ...valid,
      daily: [...valid.daily, { ...valid.daily[0], source: "other" }],
    });
    expect(parsed.sites[0].template).toBe("web-starter");
    expect(parsed.daily).toHaveLength(1);
  });

  it("refuses anything else", () => {
    expect(() =>
      parseSiteOpsExport({ ...valid, sites: [{ domain: "x" }] }),
    ).toThrow();
    expect(() => parseSiteOpsExport("Forbidden")).toThrow();
  });
});
