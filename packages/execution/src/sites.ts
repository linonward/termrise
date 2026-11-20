import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  notInArray,
} from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  opsHeartbeats,
  SITE_METRIC_SOURCES,
  siteDailyMetrics,
  sites,
  type SiteMetricSource,
} from "@repo/db/schema";

// The maintainer's live sites (docs/architecture/data-model.md#sites): a copy of what
// site-ops collects, pulled from its export every 15 minutes. site-ops holds the pvuv,
// Search Console and admin API secrets; the workbench only reads the results.

const siteSchema = z.object({
  domain: z.string().min(3).max(253),
  name: z.string().min(1).max(200),
  kind: z.string().min(1).max(40),
  template: z.string().max(40).optional(),
  repo: z.string().max(200).optional(),
  pvuv: z.string().max(40).optional(),
});
const exportSchema = z.object({
  generatedAt: z.number(),
  since: z.string(),
  sites: z.array(siteSchema).max(500),
  daily: z
    .array(
      z.object({
        domain: z.string(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        source: z.string(),
        data: z.unknown(),
        fetchedAt: z.number(),
      }),
    )
    .max(50_000),
  uptime: z.array(
    z.object({
      domain: z.string(),
      last: z
        .object({
          at: z.number(),
          status: z.number(),
          ms: z.number(),
          ok: z.boolean(),
        })
        .nullable(),
      checks24h: z.number(),
      up24h: z.number(),
      avgMs24h: z.number().nullable(),
    }),
  ),
  alerts: z.array(
    z.object({
      key: z.string(),
      state: z.enum(["up", "down"]),
      since: z.number(),
    }),
  ),
  heartbeats: z.array(
    z.object({
      source: z.string(),
      state: z.enum(["up", "down"]),
      reason: z.string(),
    }),
  ),
});
export type SiteOpsExport = z.output<typeof exportSchema>;

const isSource = (s: string): s is SiteMetricSource =>
  (SITE_METRIC_SOURCES as readonly string[]).includes(s);

/** Validates site-ops's export; daily rows of sources the workbench doesn't know are dropped. */
export function parseSiteOpsExport(body: unknown): SiteOpsExport {
  const parsed = exportSchema.parse(body);
  return { ...parsed, daily: parsed.daily.filter((r) => isSource(r.source)) };
}

/** GET site-ops's export with its bearer token (url and token come from the worker's env). */
export async function fetchSiteOpsExport(opts: {
  url: string;
  token: string;
  fetch?: typeof fetch;
}): Promise<SiteOpsExport> {
  const response = await (opts.fetch ?? fetch)(opts.url, {
    headers: { authorization: `Bearer ${opts.token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`site-ops export answered ${response.status}`);
  return parseSiteOpsExport(await response.json());
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const dayBefore = (today: string, days: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);

export type SiteSummary = {
  visitors7d: number | null;
  pageviews7d: number | null;
  /** Search Console's 28-day totals from the latest day site-ops stored. */
  search: {
    day: string;
    clicks: number;
    impressions: number;
    position: number | null;
  } | null;
  orders30d: number | null;
  revenue30d: { currency: string; amountMinor: number }[];
};

/** Headline numbers from a site's daily rows; `today` is the UTC date (YYYY-MM-DD). */
export function summarize(
  rows: { day: string; source: string; data: unknown }[],
  today: string,
): SiteSummary {
  const week = dayBefore(today, 7);
  const month = dayBefore(today, 30);
  let visitors: number | null = null;
  let pageviews: number | null = null;
  let orders: number | null = null;
  let search: SiteSummary["search"] = null;
  const revenue = new Map<string, number>();
  for (const r of rows) {
    const d = obj(r.data);
    if (r.source === "pvuv" && r.day >= week) {
      const uv = num(d.uv);
      const pv = num(d.pv);
      if (uv !== null) visitors = (visitors ?? 0) + uv;
      if (pv !== null) pageviews = (pageviews ?? 0) + pv;
    }
    if (r.source === "gsc" && (!search || r.day > search.day)) {
      const clicks = num(d.clicks);
      const impressions = num(d.impressions);
      if (clicks !== null && impressions !== null)
        search = { day: r.day, clicks, impressions, position: num(d.position) };
    }
    if (r.source === "admin" && r.day >= month) {
      const o = obj(d.orders);
      const paid = num(o.paid);
      if (paid !== null) orders = (orders ?? 0) + paid;
      for (const item of Array.isArray(o.revenue) ? o.revenue : []) {
        const { currency, amount } = obj(item);
        if (typeof currency === "string" && num(amount) !== null) {
          const key = currency.toUpperCase();
          revenue.set(key, (revenue.get(key) ?? 0) + (amount as number));
        }
      }
    }
  }
  return {
    visitors7d: visitors,
    pageviews7d: pageviews,
    search,
    orders30d: orders,
    revenue30d: [...revenue]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amountMinor]) => ({ currency, amountMinor })),
  };
}

const ms = (n: number | null | undefined) => (n == null ? null : new Date(n));

export function createSites(deps: { database: Database }) {
  const db = deps.database;

  async function rowsFor(domains: string[], since: string) {
    if (!domains.length) return [];
    return db
      .select()
      .from(siteDailyMetrics)
      .where(
        and(
          inArray(siteDailyMetrics.domain, domains),
          gte(siteDailyMetrics.day, since),
        ),
      )
      .orderBy(desc(siteDailyMetrics.day));
  }

  const toItem = (
    s: typeof sites.$inferSelect,
    rows: { day: string; source: string; data: unknown }[],
    today: string,
  ) => ({
    domain: s.domain,
    name: s.name,
    kind: s.kind,
    template: s.template,
    repo: s.repo,
    uptime24h: { checks: s.checks24h, up: s.up24h, avgMs: s.avgMs24h },
    lastCheckAt: s.lastCheckAt,
    lastStatus: s.lastStatus,
    lastOk: s.lastOk,
    alertState: s.alertState ?? "up",
    alertSince: s.alertSince,
    syncedAt: s.syncedAt,
    summary: summarize(rows, today),
  });

  return {
    /** Writes one export: sites, uptime and alerts, daily numbers, heartbeats. */
    async sync(exp: SiteOpsExport, now = new Date()) {
      const domains = exp.sites.map((s) => s.domain);
      const uptime = new Map(exp.uptime.map((u) => [u.domain, u]));
      const alerts = new Map(exp.alerts.map((a) => [a.key, a]));
      await db.transaction(async (tx) => {
        for (const s of exp.sites) {
          const u = uptime.get(s.domain);
          const a = alerts.get(s.domain);
          const values = {
            name: s.name,
            kind: s.kind,
            template: s.template ?? null,
            repo: s.repo ?? null,
            pvuvSiteId: s.pvuv ?? null,
            checks24h: u?.checks24h ?? 0,
            up24h: u?.up24h ?? 0,
            avgMs24h: u?.avgMs24h == null ? null : Math.round(u.avgMs24h),
            lastCheckAt: ms(u?.last?.at),
            lastStatus: u?.last?.status ?? null,
            lastOk: u?.last?.ok ?? null,
            alertState: a?.state ?? null,
            alertSince: ms(a?.since),
            syncedAt: now,
            removedAt: null,
          };
          await tx
            .insert(sites)
            .values({ domain: s.domain, ...values })
            .onConflictDoUpdate({ target: sites.domain, set: values });
        }
        if (domains.length)
          await tx
            .update(sites)
            .set({ removedAt: now })
            .where(
              and(notInArray(sites.domain, domains), isNull(sites.removedAt)),
            );
        const known = new Set(domains);
        for (const r of exp.daily) {
          if (!known.has(r.domain) || !isSource(r.source)) continue;
          const values = {
            data: r.data ?? {},
            fetchedAt: new Date(r.fetchedAt),
          };
          await tx
            .insert(siteDailyMetrics)
            .values({
              domain: r.domain,
              day: r.day,
              source: r.source,
              ...values,
            })
            .onConflictDoUpdate({
              target: [
                siteDailyMetrics.domain,
                siteDailyMetrics.day,
                siteDailyMetrics.source,
              ],
              set: values,
            });
        }
        for (const h of exp.heartbeats) {
          const values = { state: h.state, reason: h.reason, syncedAt: now };
          await tx
            .insert(opsHeartbeats)
            .values({ source: h.source, ...values })
            .onConflictDoUpdate({ target: opsHeartbeats.source, set: values });
        }
      });
      return { sites: domains.length, daily: exp.daily.length };
    },

    /** Live sites (not removed) with their headline numbers, by domain. */
    async list(now = new Date()) {
      const today = now.toISOString().slice(0, 10);
      const rows = await db
        .select()
        .from(sites)
        .where(isNull(sites.removedAt))
        .orderBy(asc(sites.domain));
      const daily = await rowsFor(
        rows.map((s) => s.domain),
        dayBefore(today, 35),
      );
      return rows.map((s) =>
        toItem(
          s,
          daily.filter((d) => d.domain === s.domain),
          today,
        ),
      );
    },

    /**
     * One live site's list item (uptime, alert and headline numbers) for a product's
     * domain; "www." is ignored. Null when the domain is not a live site.
     */
    async item(domain: string, now = new Date()) {
      const key = domain.toLowerCase().replace(/^www\./, "");
      const [s] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.domain, key), isNull(sites.removedAt)));
      if (!s) return null;
      const today = now.toISOString().slice(0, 10);
      return toItem(s, await rowsFor([key], dayBefore(today, 35)), today);
    },

    /** One site with its last 35 days, newest first; null when unknown. */
    async detail(domain: string, now = new Date()) {
      const today = now.toISOString().slice(0, 10);
      const [s] = await db.select().from(sites).where(eq(sites.domain, domain));
      if (!s) return null;
      const daily = await rowsFor([domain], dayBefore(today, 35));
      const byDay = new Map<
        string,
        Partial<Record<SiteMetricSource, unknown>>
      >();
      for (const r of daily)
        byDay.set(r.day, { ...byDay.get(r.day), [r.source]: r.data });
      return {
        ...toItem(s, daily, today),
        removedAt: s.removedAt,
        days: [...byDay].map(([day, v]) => ({ day, ...v })),
      };
    },

    async heartbeats() {
      return db.select().from(opsHeartbeats).orderBy(asc(opsHeartbeats.source));
    },
  };
}
