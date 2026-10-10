import { z } from "zod";

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
    /** Health check port (GET /health). */
    PORT: z.coerce.number().int().min(1).default(8080),
    KEYWORD_PROVIDER: z.enum(["fake"]),
    ANALYST_PROVIDER: z.enum(["fake"]),
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
