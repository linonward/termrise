import { z } from "zod";

const serverSchema = z
  .object({
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
    NODE_ENV: z.string().optional(),
    // Fake providers in a production build (E2E runs `next start`); never in Vercel production.
    ALLOW_FAKE_PROVIDERS: z.literal("1").optional(),
    APP_URL: z.url(),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, "must be a postgres connection string"),
    // apps/api: Better Auth and, as the migration goes on, the other APIs
    // (docs/adr/012-api-modular-monolith.md). Inlined into the browser bundle at build time.
    NEXT_PUBLIC_API_URL: z.url(),
    // Google One Tap; the client ID is public.
    GOOGLE_CLIENT_ID: z.string().min(1),
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    // Local S3-compatible server (docker-compose.yml); not allowed in production.
    R2_ENDPOINT: z.url().optional(),
    STORAGE_PROVIDER: z.enum(["r2", "fake"]).default("r2"),
    FAKE_STORAGE_DIR: z.string().min(1).optional(),
    // Example paid action (docs/architecture/tasks.md); replace with the product's provider.
    TASK_PROVIDER: z.enum(["example", "deepseek", "fake"]).default("example"),
    DEEPSEEK_API_KEY: z.string().optional(),
    DEEPSEEK_MODEL: z.string().optional(),
    PAYMENT_PROVIDER: z.enum(["waffo", "fake"]),
    WAFFO_MERCHANT_ID: z.string().optional(),
    WAFFO_PRIVATE_KEY: z.string().optional(),
    WAFFO_STORE_ID: z.string().optional(),
    SENTRY_DSN: z.url(),
    // Server-side analytics; without a key, events are not sent.
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
    // User ids allowed into /admin (docs/architecture/security.md#admin-access).
    ADMIN_USER_IDS: z
      .string()
      .default("")
      .transform((ids) =>
        ids
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_PROVIDER === "fake" && !env.FAKE_STORAGE_DIR) {
      ctx.addIssue({
        code: "custom",
        path: ["FAKE_STORAGE_DIR"],
        message: "required when STORAGE_PROVIDER=fake",
      });
    }
    if (env.TASK_PROVIDER === "deepseek") {
      for (const key of ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"] as const) {
        if (!env[key]?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "required when TASK_PROVIDER=deepseek",
          });
        }
      }
    }
    if (env.PAYMENT_PROVIDER === "waffo") {
      for (const key of [
        "WAFFO_MERCHANT_ID",
        "WAFFO_PRIVATE_KEY",
        "WAFFO_STORE_ID",
      ] as const) {
        if (!env[key]?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "required when PAYMENT_PROVIDER=waffo",
          });
        }
      }
    }
    // Fail closed: a production build without VERCEL_ENV (self-hosted) must not
    // accept the fake payment webhook, whose signature is a public constant.
    const fakeMessage =
      env.VERCEL_ENV === "production"
        ? "fake provider is not allowed in production"
        : env.NODE_ENV === "production" && !env.ALLOW_FAKE_PROVIDERS
          ? "fake provider needs ALLOW_FAKE_PROVIDERS=1 in a production build"
          : undefined;
    if (fakeMessage) {
      for (const key of [
        "TASK_PROVIDER",
        "PAYMENT_PROVIDER",
        "STORAGE_PROVIDER",
      ] as const) {
        if (env[key] === "fake") {
          ctx.addIssue({ code: "custom", path: [key], message: fakeMessage });
        }
      }
    }
    if (env.VERCEL_ENV === "production") {
      if (env.R2_ENDPOINT) {
        ctx.addIssue({
          code: "custom",
          path: ["R2_ENDPOINT"],
          message: "local storage endpoint is not allowed in production",
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

export class EnvError extends Error {
  constructor(problems: string[]) {
    super(
      `Invalid server environment:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
    this.name = "EnvError";
  }
}

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  // An empty value (`KEY=` in .env.example) counts as unset, so optional keys and defaults apply.
  const result = serverSchema.safeParse(
    Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")),
  );
  if (!result.success) {
    // Only variable names and rule messages; never echo values, which may be secrets.
    throw new EnvError(
      result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
