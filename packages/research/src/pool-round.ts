// One round of tool-site keyword selection (docs/product/keyword-pool.md#rounds):
// pull a source, screen it, deep-check the best keywords and the ones due again, and
// write a report. Every paid call goes through the pool's daily budget (budget.ts).
import { and, eq, inArray, lt, sql } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { poolKeywords, poolRounds } from "@repo/db/schema";
import { logger } from "@repo/observability/logger";

import type { Budget } from "./budget";
import type {
  Charged,
  KeywordIdea,
  KeywordProvider,
  Market,
  TrendPoint,
} from "./keyword-provider";
import {
  MAX_STRONG,
  MID_BAND,
  MIN_VARIANT_VOLUME,
  type Reason,
  screenKeywords,
  type ScreenedKeyword,
  strongCompetitors,
} from "./pool-rules";
import {
  createKeywordPool,
  type PoolKeyword,
  type PoolRound,
  type PoolStatus,
} from "./pool-service";
import { baselineChange, type Baseline, trendCheck } from "./pool-trend";
import { createProviderCache } from "./provider-cache";

const US: Market = { locationCode: 2840, languageCode: "en" };
/** Keyword-lab's suffix list (SOP appendix A), taken in order, one per round. */
export const POOL_SUFFIXES = [
  "translator",
  "generator",
  "example",
  "convert",
  "online",
  "downloader",
  "maker",
  "creator",
  "editor",
  "processor",
  "designer",
  "compiler",
  "analyzer",
  "evaluator",
  "sender",
  "receiver",
  "interpreter",
  "uploader",
  "calculator",
  "sample",
  "template",
  "format",
  "builder",
  "scheme",
  "pattern",
  "checker",
  "detector",
  "scraper",
  "manager",
  "explorer",
  "dashboard",
  "planner",
  "tracker",
  "recorder",
  "optimizer",
  "scheduler",
  "converter",
  "viewer",
  "extractor",
  "monitor",
  "notifier",
  "verifier",
  "simulator",
  "assistant",
  "constructor",
  "comparator",
  "navigator",
  "syncer",
  "connector",
  "cataloger",
  "responder",
];
/** Keywords one source pull may return. */
export const POOL_PULL_LIMIT = 1000;
/** Variants counted for S1, at most: more than this shows as "200 or more". */
export const VARIANT_LIMIT = 200;
/** Candidates per round that get their variants counted (a paid call each). */
export const VARIANT_CHECKS = 2;
/** A round running longer than this lost its worker. */
export const STALE_ROUND_MS = 30 * 60 * 1000;
/** Small sites from a deep check's top 10 become ranked:<site> sources. */
const RANKED_SOURCE_TRAFFIC = { min: 1000, max: 50_000 };

type DeepResult = {
  phrase: string;
  from: PoolStatus | null;
  status: PoolStatus;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpcMicros: number | null;
  strongCompetitors: number | null;
  relativeChange: number | null;
  recentChange: number | null;
  variantCount: number | null;
};

export type PoolRoundReport = {
  source: string | null;
  pulled: number;
  screened: Partial<Record<string, number>>;
  added: number;
  deep: DeepResult[];
  budgetStopped: boolean;
  failures: string[];
};

class BudgetStop extends Error {}

const NO_METRICS = {
  searchVolume: null,
  keywordDifficulty: null,
  cpcMicros: null,
  adsCompetition: null,
};

// A keyword due again keeps its stored data; the deep check refreshes trend and SERP.
const storedScreen = (k: PoolKeyword): ScreenedKeyword => ({
  phrase: k.phrase,
  status: "pass",
  reasons: [],
  metrics: {
    searchVolume: k.searchVolume,
    keywordDifficulty: k.keywordDifficulty,
    cpcMicros: k.cpcMicros,
    adsCompetition: null,
  },
  monthlySearches: [],
  ratio: null,
  midBand: false,
  variants: k.variants,
  kdRange: null,
});

const isHost = (site: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(site);

export function createPoolRounds(deps: {
  database: Database;
  provider: KeywordProvider;
  budget: Budget;
  /** Keywords deep-checked per round, rechecks included. */
  deepChecks: number;
  now?: () => Date;
}) {
  const { database, provider, budget } = deps;
  const now = deps.now ?? (() => new Date());
  const pool = createKeywordPool({ database, now });
  const cache = createProviderCache({ database, now });

  /** Queues today's daily round once (UTC day), at or after the given hour. */
  async function scheduleDaily(hourUtc: number) {
    const at = now();
    if (at.getUTCHours() < hourUtc) return null;
    const dayStart = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('pool-daily-round'))`,
      );
      const [today] = await tx
        .select({ id: poolRounds.id })
        .from(poolRounds)
        .where(
          and(
            eq(poolRounds.kind, "daily"),
            sql`${poolRounds.createdAt} >= ${dayStart}`,
          ),
        )
        .limit(1);
      if (today) return null;
      const [round] = await tx
        .insert(poolRounds)
        .values({ kind: "daily", createdAt: at })
        .returning();
      return round;
    });
  }

  /** Fails rounds whose worker died, so a new round can start. */
  async function failStale(olderThanMs = STALE_ROUND_MS) {
    return database
      .update(poolRounds)
      .set({
        status: "failed",
        errorCode: "ROUND_TIMED_OUT",
        finishedAt: now(),
      })
      .where(
        and(
          eq(poolRounds.status, "running"),
          inArray(poolRounds.kind, ["daily", "manual"]),
          lt(poolRounds.claimedAt, new Date(now().getTime() - olderThanMs)),
        ),
      )
      .returning({ id: poolRounds.id });
  }

  /** Claims the oldest queued round; null when there is none or another worker took it. */
  async function claim() {
    return database.transaction(async (tx) => {
      const [next] = await tx
        .select()
        .from(poolRounds)
        .where(
          and(
            eq(poolRounds.status, "queued"),
            inArray(poolRounds.kind, ["daily", "manual"]),
          ),
        )
        .orderBy(poolRounds.createdAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!next) return null;
      const [claimed] = await tx
        .update(poolRounds)
        .set({ status: "running", claimedAt: now() })
        .where(and(eq(poolRounds.id, next.id), eq(poolRounds.status, "queued")))
        .returning();
      return claimed ?? null;
    });
  }

  /** The next unused suffix, else a small site seen in a top 10, else none. */
  async function nextSource() {
    const { rows } = await database.execute<{ source: string }>(
      sql`select distinct unnest(sources) as source from pool_keywords
          union select source from pool_rounds where source is not null`,
    );
    const used = new Set(rows.map((r) => r.source));
    const suffix = POOL_SUFFIXES.find((s) => !used.has(`suffix:${s}`));
    if (suffix) return `suffix:${suffix}`;
    // A small tool site already ranking in a checked top 10: its keywords are proven demand.
    const { rows: sites } = await database.execute<{ site: string }>(
      sql`select r->>'site' as site from pool_checks c,
            jsonb_array_elements(c.data->'serp'->'results') r
          where c.kind = 'deep'
            and jsonb_typeof(c.data->'serp'->'results') = 'array'
            and (r->>'traffic')::float between ${RANKED_SOURCE_TRAFFIC.min} and ${RANKED_SOURCE_TRAFFIC.max}
          order by c.created_at desc limit 200`,
    );
    const site = sites
      .map((r) => r.site)
      .find((s) => isHost(s) && !used.has(`ranked:${s}`));
    return site ? `ranked:${site}` : null;
  }

  // A paid call through the cache and the pool's daily budget.
  async function paid<T>(
    round: PoolRound,
    operation: "suggestions" | "ranked" | "traffic" | "trend" | "serp",
    params: unknown,
    call: () => Promise<Charged<T>>,
  ): Promise<T> {
    const ttl = provider.cacheTtlMs?.[operation];
    const request = { provider: provider.name, operation, market: US, params };
    if (ttl) {
      const hit = await cache.get<T>(request);
      if (hit) return hit.value;
    }
    const charged = await budget.charge(
      {
        projectId: null,
        poolRoundId: round.id,
        poolBudget: "evergreen",
        runId: null,
        kind: "data",
        provider: provider.name,
        operation,
        maxCostMicros: provider.maxCostMicros[operation] ?? 0,
      },
      call,
    );
    if (!charged) throw new BudgetStop();
    if (ttl) await cache.set(request, charged.value, ttl);
    return charged.value;
  }

  const fieldsOf = (row: ScreenedKeyword) => ({
    searchVolume: row.metrics.searchVolume,
    keywordDifficulty: row.metrics.keywordDifficulty,
    cpcMicros: row.metrics.cpcMicros,
    variants: row.variants,
  });

  async function pull(round: PoolRound, source: string) {
    const [type, target] = source.split(":");
    if (type === "suffix") {
      const suggestions = provider.suggestions?.bind(provider);
      if (!suggestions) return [];
      const band = { ...MID_BAND, limit: POOL_PULL_LIMIT };
      return paid(round, "suggestions", { seed: target, ...band }, () =>
        suggestions(target, US, band),
      );
    }
    const ranked = provider.rankedKeywords?.bind(provider);
    if (!ranked) return [];
    const band = { minVolume: MID_BAND.minVolume, limit: POOL_PULL_LIMIT };
    return paid(round, "ranked", { site: target, ...band }, () =>
      ranked(target, US, band),
    );
  }

  async function trendOf(round: PoolRound, phrase: string) {
    const searchTrend = provider.searchTrend?.bind(provider);
    if (!searchTrend) return null;
    return paid<TrendPoint[]>(round, "trend", phrase, () =>
      searchTrend(phrase, US),
    );
  }

  // The data a screened keyword needs before a deep check: a maintainer's idea has none.
  async function metricsFor(round: PoolRound, phrase: string) {
    const suggestions = provider.suggestions?.bind(provider);
    if (!suggestions) return null;
    const band = { minVolume: 0, limit: 1 };
    const ideas = await paid<KeywordIdea[]>(
      round,
      "suggestions",
      { seed: phrase, ...band },
      () => suggestions(phrase, US, band),
    );
    return ideas.find((i) => i.phrase === phrase) ?? null;
  }

  /** H6 then H5 for one keyword; records the verdict. */
  async function deepCheck(
    round: PoolRound,
    keyword: PoolKeyword,
    screened: ScreenedKeyword,
    baselines: Map<string, Baseline | null>,
  ): Promise<DeepResult> {
    const { phrase } = keyword;
    const seed = keyword.sources
      .find((s) => s.startsWith("suffix:"))
      ?.slice("suffix:".length);
    if (seed && !baselines.has(seed)) {
      const points = await trendOf(round, seed);
      const change = points ? baselineChange(points) : null;
      baselines.set(seed, change === null ? null : { term: seed, change });
    }
    const baseline = seed ? (baselines.get(seed) ?? undefined) : undefined;
    const points = await trendOf(round, phrase);
    const trend = points ? trendCheck(points, baseline) : null;
    const result = (status: PoolStatus, reasons: Reason[], extra = {}) => ({
      status,
      reasons,
      fields: { ...fieldsOf(screened), trend, ...extra },
    });
    let verdict: ReturnType<typeof result>;
    let serpData: unknown = null;
    if (!trend || trend.result === "unsure") {
      verdict = result("unsure", [
        { rule: "H6", result: "unsure", value: trend?.months ?? null },
      ]);
    } else if (trend.result === "fail") {
      const rising =
        trend.fails.length === 1 && trend.fails[0] === "ratio" && trend.rising;
      verdict = result(
        rising ? "watch" : "failed",
        trend.fails.map((f) => ({ rule: "H6", result: "fail", value: f })),
      );
    } else {
      const serp = await paid(round, "serp", phrase, () =>
        provider.serp(phrase, US),
      );
      const sites = [...new Set(serp.map((r) => r.site).filter(isHost))];
      const siteTraffic = provider.siteTraffic?.bind(provider);
      const traffic =
        siteTraffic && sites.length > 0
          ? new Map(
              Object.entries(
                await paid<Record<string, number>>(
                  round,
                  "traffic",
                  [...sites].sort(),
                  async () => {
                    const c = await siteTraffic(sites, US);
                    return {
                      value: Object.fromEntries(c.value),
                      costMicros: c.costMicros,
                    };
                  },
                ),
              ),
            )
          : new Map<string, number>();
      const h5 = strongCompetitors(phrase, serp, traffic);
      serpData = {
        results: serp.map((r) => ({
          rank: r.rank,
          site: r.site,
          url: r.url,
          title: r.title,
          traffic: traffic.get(r.site) ?? null,
        })),
        strongSites: h5.strongSites,
      };
      const extra = { strongCompetitors: h5.strong, innerPages: h5.innerPages };
      verdict =
        h5.strong > MAX_STRONG
          ? result(
              "failed",
              [
                {
                  rule: "H5",
                  result: "fail",
                  value: h5.strong,
                  limit: MAX_STRONG,
                },
              ],
              extra,
            )
          : result("candidate", [], extra);
    }
    await pool.record({
      phrase,
      status: verdict.status,
      reasons: verdict.reasons,
      kind: "deep",
      roundId: round.id,
      fields: verdict.fields,
      data: { metrics: screened.metrics, trend, serp: serpData },
    });
    return {
      phrase,
      from: keyword.status,
      status: verdict.status,
      searchVolume: screened.metrics.searchVolume,
      keywordDifficulty: screened.metrics.keywordDifficulty,
      cpcMicros: screened.metrics.cpcMicros,
      strongCompetitors:
        (verdict.fields as { strongCompetitors?: number }).strongCompetitors ??
        null,
      relativeChange: trend?.relativeChange ?? null,
      recentChange: trend?.recentChange ?? null,
      variantCount: null,
    };
  }

  /** S1 for a candidate: phrasings with at least MIN_VARIANT_VOLUME searches. */
  async function countVariants(round: PoolRound, result: DeepResult) {
    const suggestions = provider.suggestions?.bind(provider);
    if (!suggestions) return;
    const band = { minVolume: MIN_VARIANT_VOLUME, limit: VARIANT_LIMIT };
    const ideas = await paid<KeywordIdea[]>(
      round,
      "suggestions",
      { seed: result.phrase, ...band },
      () => suggestions(result.phrase, US, band),
    );
    result.variantCount = ideas.length;
    await database
      .update(poolKeywords)
      .set({ variantCount: ideas.length })
      .where(eq(poolKeywords.phrase, result.phrase));
  }

  /** Runs a claimed round to the end and stores its report. */
  async function run(round: PoolRound) {
    const report: PoolRoundReport = {
      source: round.source ?? (await nextSource()),
      pulled: 0,
      screened: {},
      added: 0,
      deep: [],
      budgetStopped: false,
      failures: [],
    };
    const baselines = new Map<string, Baseline | null>();
    const queue: { keyword: PoolKeyword; screened: ScreenedKeyword | null }[] =
      [];
    try {
      // Due first: queued keywords from earlier rounds, then rechecks.
      for (const keyword of await pool.due(deps.deepChecks))
        queue.push({ keyword, screened: null });
      if (report.source) {
        let ideas: KeywordIdea[] = [];
        try {
          ideas = await pull(round, report.source);
        } catch (error) {
          if (error instanceof BudgetStop) throw error;
          logger.warn("pool.pull_failed", { roundId: round.id, error });
          report.failures.push("pull");
        }
        report.pulled = ideas.length;
        const seed = report.source.startsWith("suffix:")
          ? report.source.slice("suffix:".length)
          : "";
        const rows = screenKeywords(ideas, seed);
        const known = new Map(
          (
            await database
              .select({
                phrase: poolKeywords.phrase,
                status: poolKeywords.status,
              })
              .from(poolKeywords)
              .where(
                inArray(
                  poolKeywords.phrase,
                  rows.length ? rows.map((r) => r.phrase) : [""],
                ),
              )
          ).map((k) => [k.phrase, k.status]),
        );
        for (const row of rows) {
          report.screened[row.status] = (report.screened[row.status] ?? 0) + 1;
          // A keyword already in the pool keeps its verdict; it is rechecked when due.
          if (known.has(row.phrase)) {
            await database
              .update(poolKeywords)
              .set({
                sources: sql`case when ${report.source} = any(${poolKeywords.sources}) then ${poolKeywords.sources} else array_append(${poolKeywords.sources}, ${report.source}) end`,
              })
              .where(eq(poolKeywords.phrase, row.phrase));
            continue;
          }
          const status: PoolStatus =
            row.status === "pass" ? "queued" : row.status;
          const keyword = await pool.record({
            phrase: row.phrase,
            source: report.source,
            status,
            reasons: row.reasons,
            kind: "screen",
            roundId: round.id,
            fields: fieldsOf(row),
            data: {
              metrics: row.metrics,
              monthlySearches: row.monthlySearches,
              kdRange: row.kdRange,
            },
          });
          report.added++;
          if (status === "queued") queue.push({ keyword, screened: row });
        }
      }
      // Deep checks: due keywords first, then this round's, up to the limit.
      for (const item of queue.slice(0, deps.deepChecks)) {
        let screened = item.screened;
        if (!screened) {
          const k = item.keyword;
          if (k.searchVolume === null || k.status === "new") {
            // A maintainer's idea, or a keyword without data: screen it first.
            const idea = await metricsFor(round, k.phrase);
            const [row] = screenKeywords([
              idea ?? { phrase: k.phrase, metrics: NO_METRICS },
            ]);
            if (row.status !== "pass") {
              await pool.record({
                phrase: k.phrase,
                status: row.status,
                reasons: row.reasons,
                kind: "screen",
                roundId: round.id,
                fields: fieldsOf(row),
                data: { metrics: row.metrics },
              });
              continue;
            }
            screened = row;
          } else screened = storedScreen(k);
        }
        try {
          report.deep.push(
            await deepCheck(round, item.keyword, screened, baselines),
          );
        } catch (error) {
          if (error instanceof BudgetStop) throw error;
          logger.warn("pool.deep_check_failed", {
            roundId: round.id,
            phrase: item.keyword.phrase,
            error,
          });
          report.failures.push(item.keyword.phrase);
        }
      }
      for (const result of report.deep
        .filter((d) => d.status === "candidate")
        .slice(0, VARIANT_CHECKS))
        await countVariants(round, result);
    } catch (error) {
      if (!(error instanceof BudgetStop)) {
        logger.error("pool.round_failed", { roundId: round.id, error });
        return finish(round, "failed", report, "ROUND_FAILED");
      }
      report.budgetStopped = true;
    }
    const nothingDone = report.pulled === 0 && report.deep.length === 0;
    const status =
      report.budgetStopped && nothingDone
        ? "budget_exhausted"
        : report.budgetStopped || report.failures.length > 0
          ? "partial"
          : "completed";
    return finish(
      round,
      status,
      report,
      report.budgetStopped ? "DAILY_BUDGET_EXHAUSTED" : null,
    );
  }

  async function finish(
    round: PoolRound,
    status: PoolRound["status"],
    report: PoolRoundReport,
    errorCode: string | null,
  ) {
    const [done] = await database
      .update(poolRounds)
      .set({
        status,
        report,
        errorCode,
        finishedAt: now(),
        source: report.source,
      })
      .where(and(eq(poolRounds.id, round.id), eq(poolRounds.status, "running")))
      .returning();
    logger.info("pool.round_finished", {
      roundId: round.id,
      status,
      source: report.source,
    });
    return done ?? round;
  }

  return { scheduleDaily, failStale, claim, run, nextSource };
}
