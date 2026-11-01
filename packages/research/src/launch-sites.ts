// Launch sites (docs/product/keyword-pool.md#launch-sites): every few hours, read the
// newest Show HN posts, keep the ones that launch a website, and have the analyst say what
// each is, for whom and why it was made. HN, RDAP and the page fetch are free; only the
// analysis is paid, from the discovery AI budget.
import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import { LAUNCH_MOTIVES, launchSites, poolRounds } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import {
  type HackerNewsSource,
  HACKER_NEWS_ITEM_URL,
} from "./adapters/hacker-news";
import { type RdapClient, registrableDomain } from "./adapters/rdap";
import type { Budget } from "./budget";
import {
  launchSiteAnalysisSchema,
  type LaunchSiteAnalyst,
} from "./launch-site-analyst";
import type { PoolRound } from "./pool-service";

export type LaunchSite = typeof launchSites.$inferSelect;

/** Hours between rounds. */
export const LAUNCH_ROUND_HOURS = 6;
/** Newest stories read per round: Show HN, plus Show HN posts still on the new list. */
export const LAUNCH_SCAN = 200;
export const LAUNCH_PAGE_SIZE = 50;
const STALE_MS = 30 * 60 * 1000;
const WORDS_MAX = 3_000;
/** Hosts that are not one site: a post linking there launches a repo, a video or a profile. */
const NOT_A_SITE =
  /(^|\.)(github\.com|gitlab\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|medium\.com|substack\.com|reddit\.com|news\.ycombinator\.com|apps\.apple\.com|play\.google\.com|chromewebstore\.google\.com|docs\.google\.com|linkedin\.com|producthunt\.com|npmjs\.com|pypi\.org|crates\.io|huggingface\.co|arxiv\.org)$/;
/** Free hosting platforms: a subdomain there is the site; it has no registration of its own. */
const PLATFORM =
  /\.(vercel\.app|github\.io|pages\.dev|workers\.dev|netlify\.app)$/;

const decode = (html: string) =>
  html
    .replace(/<p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .trim();

export const siteOf = (url: string) => {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return NOT_A_SITE.test(host) ? null : host;
  } catch {
    return null;
  }
};

const listQuery = z.object({
  motive: z.enum(LAUNCH_MOTIVES).optional().catch(undefined),
  category: z.string().max(20).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  hidden: z.literal("1").optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export function createLaunchSites(deps: {
  database: Database;
  hackerNews?: HackerNewsSource;
  analyst?: LaunchSiteAnalyst;
  rdap?: RdapClient;
  budget?: Budget;
  /** Reads a page's <title>; tests pass a stub. */
  pageTitle?: (url: string) => Promise<string | null>;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  /** Queues a round when the last one is LAUNCH_ROUND_HOURS old. */
  async function scheduleEvery(hours = LAUNCH_ROUND_HOURS) {
    const since = new Date(now().getTime() - hours * 3_600_000);
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('launch-sites-round'))`,
      );
      const [recent] = await tx
        .select({ id: poolRounds.id })
        .from(poolRounds)
        .where(
          and(
            eq(poolRounds.kind, "launch_sites"),
            sql`${poolRounds.createdAt} > ${since}`,
          ),
        )
        .limit(1);
      if (recent) return null;
      const [round] = await tx
        .insert(poolRounds)
        .values({ kind: "launch_sites", createdAt: now() })
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
          eq(poolRounds.kind, "launch_sites"),
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
            eq(poolRounds.kind, "launch_sites"),
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

  // The post's text and the maker's own first-level replies: where they say why.
  async function makerWords(item: {
    by?: string;
    text?: string;
    kids?: number[];
  }) {
    const hn = deps.hackerNews!;
    const parts = item.text ? [decode(item.text)] : [];
    for (const id of (item.kids ?? []).slice(0, 15)) {
      const reply = await hn.item(id).catch(() => null);
      if (reply?.by && reply.by === item.by && reply.text)
        parts.push(decode(reply.text));
      if (parts.join("\n").length > WORDS_MAX) break;
    }
    return parts.length ? parts.join("\n\n").slice(0, WORDS_MAX) : null;
  }

  async function analyse(round: PoolRound, site: LaunchSite) {
    const { analyst, budget } = deps;
    if (!analyst || !budget) return false;
    const charged = await budget.charge(
      {
        projectId: null,
        poolRoundId: round.id,
        poolBudget: "new_words",
        runId: null,
        kind: "ai",
        provider: analyst.name,
        operation: "analyze",
        maxCostMicros: analyst.maxCostMicros,
      },
      () =>
        analyst.analyze({
          site: site.site,
          postTitle: site.postTitle,
          makerWords: site.makerWords,
          pageTitle: site.pageTitle,
        }),
    );
    if (!charged) return null;
    const parsed = launchSiteAnalysisSchema.safeParse(charged.value);
    if (!parsed.success) return false;
    await database
      .update(launchSites)
      .set({
        ...parsed.data,
        keywordNote: parsed.data.keywordNote ?? null,
        analyzedAt: now(),
      })
      .where(eq(launchSites.id, site.id));
    return true;
  }

  async function run(round: PoolRound) {
    const report = {
      read: 0,
      added: 0,
      analyzed: 0,
      budgetStopped: false,
      failures: 0,
    };
    try {
      const hn = deps.hackerNews;
      if (hn) {
        const ids = [
          ...new Set([
            ...(await hn.storyIds("show")),
            ...(await hn.storyIds("new")),
          ]),
        ]
          .sort((a, b) => b - a)
          .slice(0, LAUNCH_SCAN * 2);
        const known = new Set(
          (
            await database
              .select({ sourceId: launchSites.sourceId })
              .from(launchSites)
              .where(
                and(
                  eq(launchSites.source, "hacker_news"),
                  inArray(launchSites.sourceId, ids.map(String)),
                ),
              )
          ).map((r) => r.sourceId),
        );
        for (const id of ids.filter((i) => !known.has(String(i)))) {
          const item = await hn.item(id).catch(() => null);
          report.read++;
          if (
            !item ||
            item.dead ||
            item.deleted ||
            item.type !== "story" ||
            !item.url
          )
            continue;
          if (!/^show hn\b/i.test(item.title ?? "")) continue;
          const site = siteOf(item.url);
          if (!site) continue;
          const words = await makerWords(item);
          const registeredOn = PLATFORM.test(site)
            ? null
            : ((await deps.rdap?.registeredOn(registrableDomain(site)))
                ?.registeredOn ?? null);
          const pageTitle = deps.pageTitle
            ? await deps.pageTitle(item.url).catch(() => null)
            : null;
          const [row] = await database
            .insert(launchSites)
            .values({
              source: "hacker_news",
              sourceId: String(id),
              sourceUrl: `${HACKER_NEWS_ITEM_URL}${id}`,
              site,
              url: item.url,
              postTitle: (item.title ?? "").replace(/^show hn:\s*/i, ""),
              makerWords: words,
              score: item.score ?? null,
              comments: item.descendants ?? null,
              postedAt: item.time ? new Date(item.time * 1000) : null,
              registeredOn,
              pageTitle,
              firstSeenAt: now(),
            })
            .onConflictDoNothing()
            .returning();
          if (row) report.added++;
        }
      }
      // Registration dates a lookup missed before (RDAP can refuse or time out).
      if (deps.rdap) {
        const missing = await database
          .select({ id: launchSites.id, site: launchSites.site })
          .from(launchSites)
          .where(isNull(launchSites.registeredOn))
          .orderBy(desc(launchSites.postedAt))
          .limit(50);
        for (const m of missing.filter((m) => !PLATFORM.test(m.site))) {
          const age = await deps.rdap.registeredOn(registrableDomain(m.site));
          if (age.registeredOn)
            await database
              .update(launchSites)
              .set({ registeredOn: age.registeredOn })
              .where(eq(launchSites.id, m.id));
        }
      }
      // Analyse what is not analysed yet, newest first; a short budget stops here.
      const pending = await database
        .select()
        .from(launchSites)
        .where(isNull(launchSites.analyzedAt))
        .orderBy(desc(launchSites.postedAt))
        .limit(100);
      for (const site of pending) {
        const done = await analyse(round, site).catch((error: unknown) => {
          logger.warn("launch_sites.analyse_failed", {
            site: site.site,
            error,
          });
          report.failures++;
          return false;
        });
        if (done === null) {
          report.budgetStopped = true;
          break;
        }
        if (done) report.analyzed++;
      }
    } catch (error) {
      logger.error("launch_sites.round_failed", { roundId: round.id, error });
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
    logger.info("launch_sites.round_finished", { roundId: round.id, status });
    return done ?? round;
  }

  async function list(query: Record<string, string | undefined>) {
    const { motive, category, q, hidden, page } = listQuery.parse(query);
    const base = and(
      hidden
        ? sql`${launchSites.hiddenAt} is not null`
        : isNull(launchSites.hiddenAt),
      category ? eq(launchSites.category, category) : undefined,
      q
        ? sql`(${launchSites.site} ilike ${`%${q}%`} or ${launchSites.postTitle} ilike ${`%${q}%`} or ${launchSites.about} ilike ${`%${q}%`} or ${launchSites.coreKeyword} ilike ${`%${q}%`})`
        : undefined,
    );
    const where = and(
      base,
      motive ? eq(launchSites.motive, motive) : undefined,
    );
    const [items, [{ total }], counts, [lastRound]] = await Promise.all([
      database
        .select()
        .from(launchSites)
        .where(where)
        .orderBy(desc(launchSites.postedAt))
        .limit(LAUNCH_PAGE_SIZE)
        .offset((page - 1) * LAUNCH_PAGE_SIZE),
      database.select({ total: count() }).from(launchSites).where(where),
      database
        .select({ motive: launchSites.motive, n: count() })
        .from(launchSites)
        .where(base)
        .groupBy(launchSites.motive),
      database
        .select()
        .from(poolRounds)
        .where(eq(poolRounds.kind, "launch_sites"))
        .orderBy(desc(poolRounds.createdAt))
        .limit(1),
    ]);
    return {
      items,
      total,
      page,
      counts: Object.fromEntries(
        counts.map((c) => [c.motive ?? "pending", c.n]),
      ) as Record<string, number>,
      lastRound: lastRound ?? null,
    };
  }

  async function hide(id: string, hidden: boolean) {
    if (!z.uuid().safeParse(id).success)
      throw new AppError("NOT_FOUND", "Launch site not found");
    const [site] = await database
      .update(launchSites)
      .set({ hiddenAt: hidden ? now() : null })
      .where(eq(launchSites.id, id))
      .returning();
    if (!site) throw new AppError("NOT_FOUND", "Launch site not found");
    return site;
  }

  /** What the discover tab counts: sites not hidden. */
  async function visibleCount() {
    const [{ n }] = await database
      .select({ n: count() })
      .from(launchSites)
      .where(isNull(launchSites.hiddenAt));
    return n;
  }

  return { scheduleEvery, failStale, claim, run, list, hide, visibleCount };
}

/** A page's <title>, from the first 200 KB; null when it cannot be read. */
export async function fetchPageTitle(
  url: string,
  fetcher: typeof fetch = fetch,
) {
  const res = await fetcher(url, {
    headers: {
      "user-agent": "termrise-launch-sites/1.0 (+https://termrise.com)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html"))
    return null;
  const html = (await res.text()).slice(0, 200_000);
  const m = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html);
  return m ? decode(m[1]).replace(/\s+/g, " ").trim() : null;
}
