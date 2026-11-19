// The /api/sites shapes the pages read (apps/api/src/routes/sites.ts).
export type SiteSummaryDto = {
  visitors7d: number | null;
  pageviews7d: number | null;
  search: {
    day: string;
    clicks: number;
    impressions: number;
    position: number | null;
  } | null;
  orders30d: number | null;
  revenue30d: { currency: string; amountMinor: number }[];
};

export type SiteDto = {
  domain: string;
  name: string;
  kind: string;
  template: string | null;
  repo: string | null;
  uptime24h: { checks: number; up: number; avgMs: number | null };
  lastCheckAt: string | null;
  lastStatus: number | null;
  lastOk: boolean | null;
  alertState: "up" | "down";
  alertSince: string | null;
  syncedAt: string;
  summary: SiteSummaryDto;
};

export type HeartbeatDto = {
  source: string;
  state: "up" | "down";
  reason: string;
  syncedAt: string;
};

export type SiteDayDto = {
  day: string;
  pvuv?: { pv?: number; uv?: number };
  gsc?: { clicks?: number; impressions?: number; position?: number };
  admin?: {
    orders?: {
      paid?: number;
      revenue?: { currency: string; amount: number }[];
    };
  };
};

/** Share of good checks in the last 24 hours, e.g. 99.7; null without checks. */
export const uptimePercent = (u: SiteDto["uptime24h"]) =>
  u.checks ? Math.round((u.up / u.checks) * 1000) / 10 : null;
