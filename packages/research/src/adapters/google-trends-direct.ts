import { z } from "zod";

import type { TrendComparison } from "../keyword-provider";

// Google Trends' own Explore data, free, for the new words' screen (S86): the explore
// call hands back a token for the time-series widget, the widget call the daily values.
// Neither is documented; the shapes below were checked live on 2026-11-21 (US, past
// 90 days, gpts and a new word). Google throttles bursts with 429: calls are spaced out,
// and after a refusal the client stays off for a cool-down, so the caller pays
// DataForSEO for those batches instead.
export const TRENDS_HOME = "https://trends.google.com/trends/?geo=US";
const EXPLORE = "https://trends.google.com/trends/api/explore";
const MULTILINE = "https://trends.google.com/trends/api/widgetdata/multiline";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export class TrendsUnavailable extends Error {
  constructor(reason: string) {
    super(`Google Trends unavailable: ${reason}`);
    this.name = "TrendsUnavailable";
  }
}

const exploreSchema = z.object({
  widgets: z.array(
    z.looseObject({
      id: z.string(),
      token: z.string().optional(),
      request: z.unknown().optional(),
    }),
  ),
});
const multilineSchema = z.object({
  default: z.object({
    timelineData: z.array(
      z.object({
        time: z.string(),
        value: z.array(z.number()),
        isPartial: z.boolean().optional(),
      }),
    ),
  }),
});

/** The JSON after Google's anti-hijacking prefix (")]}'" and maybe a comma). */
export function stripPrefix(body: string) {
  return JSON.parse(body.replace(/^\)\]\}',?\s*/, ""));
}

export function createDirectTrends(
  deps: {
    fetch?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    /** Least time between two calls to Google. */
    minGapMs?: number;
    /** How long to stay off after a refusal. */
    coolDownMs?: number;
  } = {},
) {
  const fetcher = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? (() => Date.now());
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const minGap = deps.minGapMs ?? 8_000;
  const coolDown = deps.coolDownMs ?? 30 * 60_000;
  let cookie = "";
  let lastCall: number | null = null;
  let offUntil = 0;

  async function get(url: string) {
    const wait = lastCall === null ? 0 : lastCall + minGap - now();
    if (wait > 0) await sleep(wait);
    lastCall = now();
    let res: Response;
    try {
      res = await fetcher(url, {
        headers: { "user-agent": UA, ...(cookie ? { cookie } : {}) },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      offUntil = now() + coolDown;
      throw new TrendsUnavailable(
        error instanceof Error ? error.name : "fetch failed",
      );
    }
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    if (!res.ok) {
      offUntil = now() + coolDown;
      throw new TrendsUnavailable(`http ${res.status}`);
    }
    return res.text();
  }

  return {
    /** Off after a refusal, until the cool-down ends. */
    available: () => now() >= offUntil,

    /**
     * Interest of up to 5 phrases on one scale, US: daily over 90 days by default, like
     * DataForSEO's comparison, or weekly over 5 years. The partial current point is left
     * out. Throws TrendsUnavailable.
     */
    async compare(
      phrases: string[],
      /** Google's time range: "today 3-m" (90 days, daily) or "today 5-y" (weekly). */
      time = "today 3-m",
    ): Promise<TrendComparison> {
      if (now() < offUntil) throw new TrendsUnavailable("cooling down");
      if (!cookie) await get(TRENDS_HOME);
      const req = {
        comparisonItem: phrases
          .slice(0, 5)
          .map((keyword) => ({ keyword, geo: "US", time })),
        category: 0,
        property: "",
      };
      const explore = exploreSchema.safeParse(
        stripPrefix(
          await get(
            `${EXPLORE}?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`,
          ),
        ),
      );
      const widget = explore.success
        ? explore.data.widgets.find((w) => w.id === "TIMESERIES")
        : undefined;
      if (!widget?.token || !widget.request)
        throw new TrendsUnavailable("no time series widget");
      const series = multilineSchema.safeParse(
        stripPrefix(
          await get(
            `${MULTILINE}?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`,
          ),
        ),
      );
      if (!series.success) throw new TrendsUnavailable("unexpected data");
      return series.data.default.timelineData
        .filter((p) => !p.isPartial)
        .map((p) => ({
          at: new Date(Number(p.time) * 1000).toISOString(),
          values: p.value,
        }));
    },
  };
}

export type DirectTrends = ReturnType<typeof createDirectTrends>;
