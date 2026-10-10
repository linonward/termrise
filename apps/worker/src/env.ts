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
    /** How often the radar collects its sources. */
    TREND_INTERVAL_MS: z.coerce.number().int().min(60_000).default(3_600_000),
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
