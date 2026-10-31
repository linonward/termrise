import { createServer } from "node:http";
import { hostname } from "node:os";

import { createDb } from "@repo/db/client";
import { createMemoryQueue } from "@repo/jobs/adapters/memory";
import { logger } from "@repo/observability/logger";
import { createCommonCrawl } from "@repo/research/adapters/common-crawl";
import { createGoogleTrendsClient } from "@repo/research/adapters/google-trends";
import { createHackerNewsClient } from "@repo/research/adapters/hacker-news";
import { createRdapClient } from "@repo/research/adapters/rdap";
import { createBudget } from "@repo/research/budget";
import { createLaunchSites, fetchPageTitle } from "@repo/research/launch-sites";
import { createNewWords } from "@repo/research/new-words";
import {
  createPlatformSites,
  PLATFORM_TRAFFIC_BATCH,
} from "@repo/research/platform-sites";
import { createPoolRounds } from "@repo/research/pool-round";
import { createProviderStatus } from "@repo/research/provider-status";
import { createRadar } from "@repo/research/radar";
import { createResearchRunner } from "@repo/research/research-runner";
import { createSeedSuggester } from "@repo/research/seed-suggestions";

import { createBullQueue } from "./bullmq";
import { workerEnv } from "./env";
import {
  createAnalyst,
  createKeywordProvider,
  createLaunchSiteAnalyst,
  createNewWordAnalyst,
  createNewWordOriginAnalyst,
  createOriginSources,
  createSeedExtractor,
} from "./providers";
import { createHandlers, startWorker } from "./worker";

// The worker process (docs/architecture/jobs.md): a scheduler finds queued research runs,
// BullMQ runs them. WORKER_QUEUE=memory keeps the jobs in this process, for E2E only.
async function main() {
  const env = workerEnv(process.env);
  const database = createDb(env.DATABASE_URL);
  const monthlyCapMicros = {
    data: Math.round(env.MONTHLY_DATA_BUDGET_USD * 1_000_000),
    ai: Math.round(env.MONTHLY_AI_BUDGET_USD * 1_000_000),
  };
  const keywordProvider = createKeywordProvider(env);
  const runner = createResearchRunner({
    database,
    monthlyCapMicros,
    provider: keywordProvider,
    analyst: createAnalyst(env),
  });
  const suggester = createSeedSuggester({
    database,
    monthlyCapMicros,
    extractor: createSeedExtractor(env),
  });
  // The keyword pool's rounds: manual ones always, the daily one when enabled.
  const budget = createBudget({
    database,
    monthlyCapMicros,
    dailyPoolCapMicros: Math.round(env.POOL_DAILY_DATA_BUDGET_USD * 1_000_000),
    dailyNewWordCapMicros: {
      data: Math.round(env.NEW_WORDS_DAILY_DATA_BUDGET_USD * 1_000_000),
      ai: Math.round(env.NEW_WORDS_DAILY_AI_BUDGET_USD * 1_000_000),
    },
    dailyPlatformCapMicros: Math.round(
      env.PLATFORM_SITES_DAILY_DATA_BUDGET_USD * 1_000_000,
    ),
  });
  const rounds = createPoolRounds({
    database,
    provider: keywordProvider,
    budget,
    deepChecks: env.POOL_DEEP_CHECKS,
  });
  const newWords = createNewWords({
    database,
    provider: keywordProvider,
    analyst: createNewWordAnalyst(env),
    originSources: createOriginSources(env),
    originAnalyst: createNewWordOriginAnalyst(env),
    rdap: createRdapClient(),
    budget,
    roots: env.NEW_WORD_ROOTS,
    screensPerDay: env.NEW_WORDS_SCREENS,
    checksPerDay: env.NEW_WORDS_CHECKS,
  });
  const launchSites = env.LAUNCH_SITES_ENABLED
    ? createLaunchSites({
        database,
        hackerNews: createHackerNewsClient(),
        analyst: createLaunchSiteAnalyst(env),
        rdap: createRdapClient(),
        budget,
        pageTitle: (url) => fetchPageTitle(url),
      })
    : undefined;
  const platformSites = env.PLATFORM_SITES_ENABLED
    ? createPlatformSites({
        database,
        commonCrawl: createCommonCrawl(),
        provider: keywordProvider,
        budget,
        pageTitle: (url) => fetchPageTitle(url),
      })
    : undefined;
  const newWordsHourUtc = env.NEW_WORDS_ENABLED
    ? env.NEW_WORDS_HOUR_UTC
    : undefined;
  const dailyHourUtc = env.POOL_DAILY_ENABLED
    ? env.POOL_DAILY_HOUR_UTC
    : undefined;
  const radarSources = [
    ...(env.HACKER_NEWS_ENABLED ? (["hacker_news"] as const) : []),
    ...(env.GOOGLE_TRENDS_ENABLED ? (["google_trends"] as const) : []),
  ];
  const radar =
    radarSources.length > 0
      ? createRadar({
          database,
          hackerNews: env.HACKER_NEWS_ENABLED
            ? createHackerNewsClient()
            : undefined,
          googleTrends: env.GOOGLE_TRENDS_ENABLED
            ? createGoogleTrendsClient()
            : undefined,
        })
      : undefined;

  const stops: (() => Promise<unknown>)[] = [];
  if (env.WORKER_QUEUE === "bullmq") {
    const queue = createBullQueue(env.REDIS_URL!);
    stops.push(
      await startWorker(
        queue,
        createHandlers({
          runner,
          suggester,
          queue,
          radar,
          rounds,
          dailyHourUtc,
          everyDays: env.POOL_ROUND_EVERY_DAYS,
          newWords,
          newWordsHourUtc,
          launchSites,
          platformSites,
        }),
      ),
    );
    await queue.schedule("research.scan", env.SCAN_INTERVAL_MS);
    await queue.schedule("pool.scan", env.POOL_SCAN_INTERVAL_MS);
    // One schedule per source; a source turned off loses its schedule. The schedule
    // without a source in its id is from before Google Trends.
    await queue.unschedule("trend.ingest");
    for (const provider of ["hacker_news", "google_trends"] as const) {
      const id = `trend.ingest-${provider}`;
      if (radarSources.includes(provider))
        await queue.schedule(
          "trend.ingest",
          env.TREND_INTERVAL_MS,
          { provider },
          id,
        );
      else await queue.unschedule(id);
    }
  } else {
    // E2E: no radar collection; tests write radar items themselves.
    const queue = createMemoryQueue();
    stops.push(
      await startWorker(queue, createHandlers({ runner, suggester, queue })),
    );
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await queue.enqueue("research.scan", {});
        await queue.drain();
      } finally {
        busy = false;
      }
    }, env.SCAN_INTERVAL_MS);
    stops.push(async () => clearInterval(timer));
  }

  // The API shows the services from this row (/settings/providers).
  const status = createProviderStatus({ database });
  const beat = () =>
    status
      .heartbeat({
        workerId: env.WORKER_ID ?? hostname(),
        keywordProvider: env.KEYWORD_PROVIDER,
        analystProvider: env.ANALYST_PROVIDER,
        analystModel:
          env.ANALYST_PROVIDER === "deepseek" ? env.DEEPSEEK_MODEL! : null,
        radarSources: [...radarSources],
        budgets: {
          monthly: {
            data: env.MONTHLY_DATA_BUDGET_USD,
            ai: env.MONTHLY_AI_BUDGET_USD,
          },
          evergreen: {
            enabled: env.POOL_DAILY_ENABLED === "1",
            everyDays: env.POOL_ROUND_EVERY_DAYS,
            dailyData: env.POOL_DAILY_DATA_BUDGET_USD,
          },
          newWords: {
            enabled: env.NEW_WORDS_ENABLED === "1",
            dailyData: env.NEW_WORDS_DAILY_DATA_BUDGET_USD,
            dailyAi: env.NEW_WORDS_DAILY_AI_BUDGET_USD,
            checks: env.NEW_WORDS_CHECKS,
            screens: env.NEW_WORDS_SCREENS,
          },
          platform: {
            enabled: env.PLATFORM_SITES_ENABLED === "1",
            dailyData: env.PLATFORM_SITES_DAILY_DATA_BUDGET_USD,
            batch: PLATFORM_TRAFFIC_BATCH,
          },
        },
      })
      .catch((error: unknown) =>
        logger.warn("worker.heartbeat_failed", { error }),
      );
  await beat();
  const heartbeat = setInterval(beat, env.HEARTBEAT_INTERVAL_MS);
  stops.push(async () => clearInterval(heartbeat));

  const server = createServer((req, res) => {
    const ok = req.url === "/health";
    res.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { ok: true } : { error: "not found" }));
  }).listen(env.PORT);
  logger.info("worker.started", {
    queue: env.WORKER_QUEUE,
    port: env.PORT,
    radar: radarSources,
    analyst: env.ANALYST_PROVIDER,
    keywords: env.KEYWORD_PROVIDER,
  });

  // The platform sends SIGTERM before it stops the container: finish running jobs first.
  async function shutdown() {
    logger.info("worker.stopping", {});
    for (const stop of stops) await stop();
    server.close();
    await database.pool.end();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.error("worker.failed", { error });
  process.exit(1);
});
