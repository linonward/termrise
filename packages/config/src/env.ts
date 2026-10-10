import { z } from "zod";

// The web app only renders pages; data, payments, storage and AI live in apps/api, whose
// bindings are checked by apps/api/src/env.ts (docs/architecture/environment.md).
const serverSchema = z
  .object({
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
    NODE_ENV: z.string().optional(),
    APP_URL: z.url(),
    // apps/api (docs/adr/012-api-modular-monolith.md). Inlined into the browser bundle at build time.
    NEXT_PUBLIC_API_URL: z.url(),
    // Google One Tap; the client ID is public.
    GOOGLE_CLIENT_ID: z.string().min(1),
    // Local S3-compatible server (docker-compose.yml): the CSP lets the browser upload to it.
    // Not allowed in production.
    R2_ENDPOINT: z.url().optional(),
    SENTRY_DSN: z.url(),
  })
  .superRefine((env, ctx) => {
    if (env.VERCEL_ENV === "production" && env.R2_ENDPOINT) {
      ctx.addIssue({
        code: "custom",
        path: ["R2_ENDPOINT"],
        message: "local storage endpoint is not allowed in production",
      });
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
