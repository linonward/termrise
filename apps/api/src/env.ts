import { z } from "zod";

import { EnvError } from "@repo/config/env";
import type { Database } from "@repo/db/client";

// Bindings of the Worker: vars and Hyperdrive in wrangler.jsonc, secrets from
// `wrangler secret put`, locally .dev.vars (docs/architecture/environment.md#api-bindings).
// Workers have no process.env: read them through apiEnv(c.env) in a route, never in a package.
const schema = z
  .object({
    /** Hyperdrive in front of Neon; locally CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE. */
    HYPERDRIVE: z.object({ connectionString: z.string().min(1) }),
    /** The web app (apps/web): CORS origin, trusted origin for auth callbacks. */
    APP_URL: z.url(),
    /** This API's own URL; Better Auth builds magic links and OAuth callbacks with it. */
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    /** Parent domain shared with the web app, e.g. termrise.com; unset locally. */
    AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    /** Unset: server analytics events are dropped. */
    POSTHOG_KEY: z.string().min(1).optional(),
    POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
    // Example paid action (docs/architecture/tasks.md); replace with the product's provider.
    TASK_PROVIDER: z.enum(["example", "deepseek", "fake"]).default("example"),
    DEEPSEEK_API_KEY: z.string().min(1).optional(),
    DEEPSEEK_MODEL: z.string().min(1).optional(),
    /** Only E2E sets it. Workers have no NODE_ENV, so fake providers always need it. */
    ALLOW_FAKE_PROVIDERS: z.literal("1").optional(),
  })
  .superRefine((env, ctx) => {
    if (env.TASK_PROVIDER === "deepseek")
      for (const key of ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"] as const)
        if (!env[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "required when TASK_PROVIDER=deepseek",
          });
    if (env.TASK_PROVIDER === "fake" && !env.ALLOW_FAKE_PROVIDERS)
      ctx.addIssue({
        code: "custom",
        path: ["TASK_PROVIDER"],
        message: "fake provider needs ALLOW_FAKE_PROVIDERS=1",
      });
  });

export type Bindings = z.input<typeof schema>;
export type ApiEnv = z.output<typeof schema>;

export function apiEnv(bindings: Bindings): ApiEnv {
  // An empty value counts as unset, as in the web app's env schema.
  const result = schema.safeParse(
    Object.fromEntries(Object.entries(bindings).filter(([, v]) => v !== "")),
  );
  if (!result.success) {
    // Only names and rule messages; never echo values, which may be secrets.
    throw new EnvError(
      result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  }
  return result.data;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    /** One connection for this request (middleware/database.ts). */
    db: Database;
    /** Runs a task after the response, before the connection closes. */
    defer: (task: () => Promise<void>) => void;
    /** The signed-in user (middleware/session.ts). */
    user: { id: string };
  };
};
