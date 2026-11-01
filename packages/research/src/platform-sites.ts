// Platform sites (docs/product/keyword-pool.md#platform-sites): sites on free hosting
// platforms that get Google organic traffic. Each round reads Common Crawl's list of the
// platforms' hosts (free), checks a batch of them for traffic, rechecks the ones with
// traffic once a month and looks up the main keyword of the biggest. Only the traffic and
// keyword lookups are paid, from the platform-sites data budget.
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  PLATFORMS,
  platformCrawls,
  platformSiteMonths,
  platformSites,
  poolRounds,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import type { CommonCrawl, Platform } from "./adapters/common-crawl";
import type { Budget } from "./budget";
import type { KeywordProvider, Market } from "./keyword-provider";
import type { PoolRound } from "./pool-service";

export type PlatformSite = typeof platformSites.$inferSelect;

/** Hosts checked for traffic per round: $0.012 + 300 × $0.00012 = $0.048. */
export const PLATFORM_TRAFFIC_BATCH = 300;
/** Unchecked hosts to keep in hand; the next index page is read below this. */
export const PLATFORM_BACKLOG = 2_000;
/** Index pages read per round at most. */
const PAGES_PER_ROUND = 3;
/** Monthly visits from which a site's main keyword is looked up. */
export const PLATFORM_KEYWORD_MIN_ETV = 100;
const KEYWORDS_PER_ROUND = 3;
/** $0.012 + 10 × $0.00012, rounded up. */
const KEYWORD_RESERVE = 15_000;
const TITLES_PER_ROUND = 30;
export const PLATFORM_PAGE_SIZE = 50;
/** Months shown in the list, newest last. */
export const PLATFORM_MONTHS = 6;
/** Monthly visits from which a site is listed: an estimate below one visit is noise. */
export const PLATFORM_MIN_ETV = 1;
const STALE_MS = 30 * 60 * 1000;
const US: Market = { locationCode: 2840, languageCode: "en" };

/** A traffic call's most cost: $0.012 per task + $0.00012 per host, with a margin. */
export const trafficReserve = (hosts: number) => 15_000 + hosts * 150;

export const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/** The last `n` months up to the date's month, oldest first. */
export function lastMonths(date: Date, n = PLATFORM_MONTHS) {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - i, 1),
    );
    months.push(monthOf(d));
  }
  return months;
}

const listQuery = z.object({
  platform: z.enum(PLATFORMS).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  hidden: z.literal("1").optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

class BudgetStop extends Error {}

export function createPlatformSites(deps: {
  database: Database;
  commonCrawl?: CommonCrawl;
  provider?: KeywordProvider;
  budget?: Budget;
  /** Reads a page's <title>; tests pass a stub. */
  pageTitle?: (url: string) => Promise<string | null>;
  market?: Market;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());
  const market = deps.market ?? US;

  /** Queues a round when the last one is `hours` old. */
  async function scheduleEvery(hours = 24) {
    const since = new Date(now().getTime() - hours * 3_600_000);
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('platform-sites-round'))`,
      );
      const [recent] = await tx
        .select({ id: poolRounds.id })
        .from(poolRounds)
        .where(
          and(
            eq(poolRounds.kind, "platform_sites"),
            sql`${poolRounds.createdAt} > ${since}`,
          ),
        )
        .limit(1);
      if (recent) return null;
      const [round] = await tx
        .insert(poolRounds)
        .values({ kind: "platform_sites", createdAt: now() })
        .returning();
      return round;
    });
  }

  async function failStale() {
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
          eq(poolRounds.kind, "platform_sites"),
          lt(poolRounds.claimedAt, new Date(now().getTime() - STALE_MS)),
        ),
      )
      .returning({ id: poolRounds.id });
  }

  async function claim() {
    return database.transaction(async (tx) => {
      const [next] = await tx
        .select()
        .from(poolRounds)
        .where(
          and(
            eq(poolRounds.status, "queued"),
            eq(poolRounds.kind, "platform_sites"),
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

  async function paid<T>(
    round: PoolRound,
    operation: string,
    reserveMicros: number,
    call: () => Promise<{ value: T; costMicros: number }>,
  ) {
    const { budget, provider } = deps;
    if (!budget || !provider) throw new BudgetStop();
    const charged = await budget.charge(
      {
        projectId: null,
        poolRoundId: round.id,
        poolBudget: "platform",
        runId: null,
        kind: "data",
        provider: provider.name,
        operation,
        maxCostMicros: reserveMicros,
      },
      call,
    );
    if (!charged) throw new BudgetStop();
    return charged.value;
  }

  async function backlog() {
    const [{ n }] = await database
      .select({ n: count() })
      .from(platformSites)
      .where(
        and(isNull(platformSites.checkedAt), isNull(platformSites.hiddenAt)),
      );
    return n;
  }

  // Reads index pages, one platform at a time in turn, while few hosts wait for a check.
  async function crawl(report: {
    pagesRead: number;
    added: number;
    failures: number;
  }) {
    const cc = deps.commonCrawl;
    if (!cc) return;
    const collection = await cc.latestCollection();
    const skip = new Set<Platform>();
    for (let read = 0; read < PAGES_PER_ROUND; read++) {
      if ((await backlog()) >= PLATFORM_BACKLOG) return;
      const rows = await database
        .select()
        .from(platformCrawls)
        .where(eq(platformCrawls.collection, collection));
      const byPlatform = new Map(rows.map((r) => [r.platform, r]));
      // Platforms not started in this collection first, then the least recently read.
      const order = PLATFORMS.filter((p) => !skip.has(p)).sort(
        (a, b) =>
          (byPlatform.get(a)?.updatedAt.getTime() ?? 0) -
          (byPlatform.get(b)?.updatedAt.getTime() ?? 0),
      );
      let platform: Platform | undefined;
      let state: { pages: number; nextPage: number } | undefined;
      for (const p of order) {
        const row = byPlatform.get(p);
        if (row && row.nextPage >= row.pages) continue;
        if (!row) {
          const pages = await cc
            .pages(collection, p)
            .catch((error: unknown) => {
              logger.warn("platform_sites.pages_failed", {
                platform: p,
                error,
              });
              return null;
            });
          if (pages === null) {
            report.failures++;
            skip.add(p);
            continue;
          }
          await database
            .insert(platformCrawls)
            .values({ collection, platform: p, pages, updatedAt: now() })
            .onConflictDoNothing();
          if (pages === 0) continue;
          state = { pages, nextPage: 0 };
        } else state = row;
        platform = p;
        break;
      }
      if (!platform || !state) return;
      const hosts = await cc
        .hosts(collection, platform, state.nextPage)
        .catch((error: unknown) => {
          logger.warn("platform_sites.page_failed", { platform, error });
          return null;
        });
      if (hosts === null) {
        report.failures++;
        skip.add(platform);
        continue;
      }
      for (let i = 0; i < hosts.length; i += 500) {
        const added = await database
          .insert(platformSites)
          .values(
            hosts.slice(i, i + 500).map((host) => ({
              host,
              platform: platform!,
              firstCrawl: collection,
              firstSeenAt: now(),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: platformSites.id });
        report.added += added.length;
      }
      await database
        .update(platformCrawls)
        .set({ nextPage: state.nextPage + 1, updatedAt: now() })
        .where(
          and(
            eq(platformCrawls.collection, collection),
            eq(platformCrawls.platform, platform),
          ),
        );
      report.pagesRead++;
    }
  }

  // Sites with traffic not checked this month come first, then unchecked hosts in a
  // stable spread order (so one platform or one prefix does not take every batch).
  async function checkTraffic(
    round: PoolRound,
    report: { checked: number; withTraffic: number },
  ) {
    const provider = deps.provider;
    if (!provider?.siteTraffic) return;
    const monthStart = new Date(`${monthOf(now())}-01T00:00:00Z`);
    const due = await database
      .select({ id: platformSites.id, host: platformSites.host })
      .from(platformSites)
      .where(
        and(
          isNull(platformSites.hiddenAt),
          or(
            isNull(platformSites.checkedAt),
            and(
              gt(platformSites.etv, 0),
              lt(platformSites.checkedAt, monthStart),
            ),
          ),
        ),
      )
      .orderBy(
        sql`${platformSites.checkedAt} is null`,
        sql`md5(${platformSites.host})`,
      )
      .limit(PLATFORM_TRAFFIC_BATCH);
    if (!due.length) return;
    const traffic = await paid(
      round,
      "traffic",
      trafficReserve(due.length),
      () =>
        provider.siteTraffic!(
          due.map((d) => d.host),
          market,
        ),
    );
    const month = monthOf(now());
    for (const site of due) {
      const etv = traffic.get(site.host) ?? 0;
      await database
        .update(platformSites)
        .set({ etv, checkedAt: now() })
        .where(eq(platformSites.id, site.id));
      if (etv > 0) {
        report.withTraffic++;
        await database
          .insert(platformSiteMonths)
          .values({ siteId: site.id, month, etv, measuredAt: now() })
          .onConflictDoUpdate({
            target: [platformSiteMonths.siteId, platformSiteMonths.month],
            set: { etv, measuredAt: now() },
          });
      }
    }
    report.checked += due.length;
  }

  async function lookUpKeywords(
    round: PoolRound,
    report: { keywords: number },
  ) {
    const provider = deps.provider;
    if (!provider?.rankedKeywords) return;
    const sites = await database
      .select({ id: platformSites.id, host: platformSites.host })
      .from(platformSites)
      .where(
        and(
          isNull(platformSites.hiddenAt),
          isNull(platformSites.keywordCheckedAt),
          gte(platformSites.etv, PLATFORM_KEYWORD_MIN_ETV),
        ),
      )
      .orderBy(desc(platformSites.etv))
      .limit(KEYWORDS_PER_ROUND);
    for (const site of sites) {
      const ranked = await paid(round, "ranked", KEYWORD_RESERVE, () =>
        provider.rankedKeywords!(site.host, market, {
          minVolume: 0,
          limit: 10,
        }),
      );
      const top = ranked.find((k) => k.rank <= 10) ?? ranked[0];
      await database
        .update(platformSites)
        .set({
          topKeyword: top?.phrase ?? null,
          topKeywordVolume: top?.metrics.searchVolume ?? null,
          topKeywordRank: top?.rank ?? null,
          keywordCheckedAt: now(),
        })
        .where(eq(platformSites.id, site.id));
      if (top) report.keywords++;
    }
  }

  async function readTitles(report: { titles: number }) {
    if (!deps.pageTitle) return;
    const sites = await database
      .select({ id: platformSites.id, host: platformSites.host })
      .from(platformSites)
      .where(
        and(
          isNull(platformSites.hiddenAt),
          isNull(platformSites.titleCheckedAt),
          gt(platformSites.etv, 0),
        ),
      )
      .orderBy(desc(platformSites.etv))
      .limit(TITLES_PER_ROUND);
    for (const site of sites) {
      const title = await deps
        .pageTitle(`https://${site.host}/`)
        .catch(() => null);
      await database
        .update(platformSites)
        .set({ pageTitle: title, titleCheckedAt: now() })
        .where(eq(platformSites.id, site.id));
      if (title) report.titles++;
    }
  }

  async function run(round: PoolRound) {
    const report = {
      pagesRead: 0,
      added: 0,
      checked: 0,
      withTraffic: 0,
      keywords: 0,
      titles: 0,
      budgetStopped: false,
      failures: 0,
    };
    try {
      await crawl(report).catch((error: unknown) => {
        logger.warn("platform_sites.crawl_failed", { error });
        report.failures++;
      });
      try {
        await checkTraffic(round, report);
        await lookUpKeywords(round, report);
      } catch (error) {
        if (!(error instanceof BudgetStop)) throw error;
        report.budgetStopped = true;
      }
      await readTitles(report);
    } catch (error) {
      logger.error("platform_sites.round_failed", { roundId: round.id, error });
      return finish(round, "failed", report, "ROUND_FAILED");
    }
    return finish(
      round,
      report.budgetStopped || report.failures > 0 ? "partial" : "completed",
      report,
      report.budgetStopped ? "DAILY_BUDGET_EXHAUSTED" : null,
    );
  }

  async function finish(
    round: PoolRound,
    status: PoolRound["status"],
    report: object,
    errorCode: string | null,
  ) {
    const [done] = await database
      .update(poolRounds)
      .set({ status, report, errorCode, finishedAt: now() })
      .where(and(eq(poolRounds.id, round.id), eq(poolRounds.status, "running")))
      .returning();
    logger.info("platform_sites.round_finished", { roundId: round.id, status });
    return done ?? round;
  }

  /** Sites with traffic, biggest first, with their visits for the last months. */
  async function list(query: Record<string, string | undefined>) {
    const { platform, q, hidden, page } = listQuery.parse(query);
    const base = and(
      hidden
        ? isNotNull(platformSites.hiddenAt)
        : isNull(platformSites.hiddenAt),
      gte(platformSites.etv, PLATFORM_MIN_ETV),
      q
        ? sql`(${platformSites.host} ilike ${`%${q}%`} or ${platformSites.pageTitle} ilike ${`%${q}%`} or ${platformSites.topKeyword} ilike ${`%${q}%`})`
        : undefined,
    );
    const where = and(
      base,
      platform ? eq(platformSites.platform, platform) : undefined,
    );
    const months = lastMonths(now());
    const [items, [{ total }], counts, [stats], [lastRound]] =
      await Promise.all([
        database
          .select()
          .from(platformSites)
          .where(where)
          .orderBy(desc(platformSites.etv), asc(platformSites.host))
          .limit(PLATFORM_PAGE_SIZE)
          .offset((page - 1) * PLATFORM_PAGE_SIZE),
        database.select({ total: count() }).from(platformSites).where(where),
        database
          .select({ platform: platformSites.platform, n: count() })
          .from(platformSites)
          .where(base)
          .groupBy(platformSites.platform),
        database
          .select({
            known: count(),
            checked: sql<number>`count(${platformSites.checkedAt})::int`,
          })
          .from(platformSites),
        database
          .select()
          .from(poolRounds)
          .where(eq(poolRounds.kind, "platform_sites"))
          .orderBy(desc(poolRounds.createdAt))
          .limit(1),
      ]);
    const history = items.length
      ? await database
          .select()
          .from(platformSiteMonths)
          .where(
            and(
              inArray(
                platformSiteMonths.siteId,
                items.map((i) => i.id),
              ),
              inArray(platformSiteMonths.month, months),
            ),
          )
      : [];
    return {
      months,
      items: items.map((site) => ({
        ...site,
        monthly: Object.fromEntries(
          history
            .filter((h) => h.siteId === site.id)
            .map((h) => [h.month, h.etv]),
        ) as Record<string, number>,
      })),
      total,
      page,
      counts: Object.fromEntries(
        counts.map((c) => [c.platform, c.n]),
      ) as Record<string, number>,
      known: stats.known,
      checked: stats.checked,
      lastRound: lastRound ?? null,
    };
  }

  async function hide(id: string, hidden: boolean) {
    if (!z.uuid().safeParse(id).success)
      throw new AppError("NOT_FOUND", "Platform site not found");
    const [site] = await database
      .update(platformSites)
      .set({ hiddenAt: hidden ? now() : null })
      .where(eq(platformSites.id, id))
      .returning();
    if (!site) throw new AppError("NOT_FOUND", "Platform site not found");
    return site;
  }

  /** What the discover tab counts: sites with traffic, not hidden. */
  async function visibleCount() {
    const [{ n }] = await database
      .select({ n: count() })
      .from(platformSites)
      .where(
        and(
          isNull(platformSites.hiddenAt),
          gte(platformSites.etv, PLATFORM_MIN_ETV),
        ),
      );
    return n;
  }

  return { scheduleEvery, failStale, claim, run, list, hide, visibleCount };
}
