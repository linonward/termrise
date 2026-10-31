import { z } from "zod";

import { isDeepSeekModel } from "@repo/research/adapters/deepseek-prices";

// The worker's own variables (docs/architecture/environment.md#worker); it never reads the
// web or API configuration. Errors name the variable, never its value.
const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    /** bullmq: Redis (locally docker compose, in production Upstash rediss://). memory: E2E. */
    WORKER_QUEUE: z.enum(["bullmq", "memory"]).default("bullmq"),
    REDIS_URL: z.string().min(1).optional(),
    /** How often the scheduler looks for queued research runs. */
    SCAN_INTERVAL_MS: z.coerce.number().int().min(100).default(5000),
    /** 1: collect Hacker News into the radar (public API, no key). */
    HACKER_NEWS_ENABLED: z.literal("1").optional(),
    /** 1: collect Google Trends Trending Now (US) into the radar (public RSS, no key). */
    GOOGLE_TRENDS_ENABLED: z.literal("1").optional(),
    /** How often the radar collects its sources. */
    TREND_INTERVAL_MS: z.coerce.number().int().min(60_000).default(3_600_000),
    /** How often the worker writes its heartbeat (worker_heartbeats). */
    HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(100).default(60_000),
    /** Names this process in the heartbeat; default the host name. */
    WORKER_ID: z.string().min(1).max(100).optional(),
    /** Health check port (GET /health). */
    PORT: z.coerce.number().int().min(1).default(8080),
    /** dataforseo makes paid calls, charged to each project's data budget. */
    KEYWORD_PROVIDER: z.enum(["fake", "dataforseo"]),
    DATAFORSEO_LOGIN: z.string().min(1).optional(),
    DATAFORSEO_PASSWORD: z.string().min(1).optional(),
    /** deepseek makes paid calls, charged to each project's AI budget. */
    ANALYST_PROVIDER: z.enum(["fake", "deepseek"]),
    DEEPSEEK_API_KEY: z.string().min(1).optional(),
    /** A model in the price table (deepseek-prices.ts), e.g. deepseek-flash. */
    DEEPSEEK_MODEL: z.string().min(1).optional(),
    /**
     * The service's caps on paid calls per calendar month (UTC), all projects together:
     * past them no project can make a paid call until the next month.
     */
    MONTHLY_DATA_BUDGET_USD: z.coerce.number().min(0).max(100_000).default(10),
    MONTHLY_AI_BUDGET_USD: z.coerce.number().min(0).max(100_000).default(2),
    /** 1: run the keyword pool's daily round (docs/product/keyword-pool.md#rounds). */
    POOL_DAILY_ENABLED: z.literal("1").optional(),
    /** The UTC hour from which the daily round may start (0 is 08:00 in Shanghai). */
    POOL_DAILY_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(0),
    /** Days between scheduled rounds: 1 daily, 7 weekly. */
    POOL_ROUND_EVERY_DAYS: z.coerce.number().int().min(1).max(60).default(1),
    /** What the pool's rounds may spend on data per UTC day, all rounds together. */
    POOL_DAILY_DATA_BUDGET_USD: z.coerce.number().min(0).max(1000).default(0.5),
    /** Keywords deep-checked per round, rechecks included. */
    POOL_DEEP_CHECKS: z.coerce.number().int().min(1).max(50).default(6),
    /** How often the worker looks for a pool round to run. */
    POOL_SCAN_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    /** 1: collect and judge new words every day (docs/product/keyword-pool.md#new-words). */
    NEW_WORDS_ENABLED: z.literal("1").optional(),
    NEW_WORDS_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(0),
    /** What new-word rounds may spend per UTC day, apart from the evergreen rounds. */
    NEW_WORDS_DAILY_DATA_BUDGET_USD: z.coerce
      .number()
      .min(0)
      .max(1000)
      .default(0.5),
    NEW_WORDS_DAILY_AI_BUDGET_USD: z.coerce
      .number()
      .min(0)
      .max(1000)
      .default(0.05),
    /** Words measured per day. */
    NEW_WORDS_CHECKS: z.coerce.number().int().min(1).max(100).default(12),
    /** Root words, comma separated; default new-words.ts DEFAULT_ROOTS. */
    NEW_WORD_ROOTS: z
      .string()
      .optional()
      .transform((v) =>
        v
          ? v
              .split(",")
              .map((r) => r.trim().toLowerCase())
              .filter(Boolean)
          : undefined,
      ),
    /** 1: read Show HN every 6 hours for newly launched sites (launch-sites.ts). */
    LAUNCH_SITES_ENABLED: z.literal("1").optional(),
    /** 1: find sites with Google traffic on vercel.app, github.io and pages.dev once a day (platform-sites.ts). */
    PLATFORM_SITES_ENABLED: z.literal("1").optional(),
    /** Optional: raises GitHub's search limit for new-word origins (10 a minute without). */
    GITHUB_TOKEN: z.string().min(1).optional(),
    /** What platform-site rounds may spend on data per day: $2 a month by default. */
    PLATFORM_SITES_DAILY_DATA_BUDGET_USD: z.coerce
      .number()
      .min(0)
      .max(1000)
      .default(0.066),
    /** Fake providers make up their data: only tests and local development allow them. */
    ALLOW_FAKE_PROVIDERS: z.literal("1").optional(),
  })
  .superRefine((env, ctx) => {
    if (env.WORKER_QUEUE === "bullmq" && !env.REDIS_URL)
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "required when WORKER_QUEUE=bullmq",
      });
    if (env.KEYWORD_PROVIDER === "dataforseo")
      for (const key of ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"] as const)
        if (!env[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "required when KEYWORD_PROVIDER=dataforseo",
          });
    if (env.ANALYST_PROVIDER === "deepseek") {
      if (!env.DEEPSEEK_API_KEY)
        ctx.addIssue({
          code: "custom",
          path: ["DEEPSEEK_API_KEY"],
          message: "required when ANALYST_PROVIDER=deepseek",
        });
      if (!env.DEEPSEEK_MODEL || !isDeepSeekModel(env.DEEPSEEK_MODEL))
        ctx.addIssue({
          code: "custom",
          path: ["DEEPSEEK_MODEL"],
          message: "must be a model in the DeepSeek price table",
        });
    }
    for (const key of ["KEYWORD_PROVIDER", "ANALYST_PROVIDER"] as const)
      if (env[key] === "fake" && !env.ALLOW_FAKE_PROVIDERS)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "fake provider needs ALLOW_FAKE_PROVIDERS=1",
        });
  });

export type WorkerEnv = z.output<typeof schema>;

export function workerEnv(source: Record<string, string | undefined>) {
  const result = schema.safeParse(
    Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")),
  );
  if (!result.success)
    throw new Error(
      `Invalid worker environment: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  return result.data;
}
