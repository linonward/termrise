import { Hono, type Context } from "hono";
import { cors } from "hono/cors";

import { createPostHogAnalyticsProvider } from "@repo/analytics/adapters/posthog-node";
import { createAnalyticsService } from "@repo/analytics/analytics-service";
import { createAuth } from "@repo/auth/create-auth";
import { sendMagicLinkEmail } from "@repo/auth/magic-link-email";
import { createMagicLinkLimiter } from "@repo/auth/magic-link-limit";
import { createOnUserCreated } from "@repo/auth/on-user-created";
import { createRateLimitService } from "@repo/auth/rate-limit";
import { localeFromHeaders } from "@repo/config/locale";
import { createCreditService } from "@repo/credits/credit-service";

import product from "../../../../product.config";
import { apiEnv, type AppEnv } from "../env";
import { messages } from "../messages";
import { database } from "../middleware/database";

export type AuthDeps = {
  /** Resend transport; tests capture the email instead of sending it. */
  emailTransport?: typeof fetch;
};

// Better Auth at /api/auth/* (docs/adr/012-api-modular-monolith.md). The web app calls it
// from the browser (CORS with credentials) and shares the session cookie through
// AUTH_COOKIE_DOMAIN. Preflight requests are answered before a connection opens.
export function authRoutes(deps: AuthDeps = {}) {
  return new Hono<AppEnv>()
    .use("*", (c, next) => {
      const appOrigin = new URL(apiEnv(c.env).APP_URL).origin;
      return cors({
        origin: (origin) => (origin === appOrigin ? origin : null),
        credentials: true,
      })(c, next);
    })
    .use("*", database)
    .on(["GET", "POST"], "/*", (c) => requestAuth(c, deps).handler(c.req.raw));
}

function requestAuth(c: Context<AppEnv>, deps: AuthDeps) {
  const env = apiEnv(c.env);
  const db = c.var.db;
  const limitMagicLink = createMagicLinkLimiter(createRateLimitService(db), {
    // Cloudflare sets the client's address in cf-connecting-ip.
    clientIp: (headers) => headers.get("cf-connecting-ip") ?? undefined,
  });
  const analytics = env.POSTHOG_KEY
    ? createAnalyticsService({
        database: db,
        provider: createPostHogAnalyticsProvider({
          key: env.POSTHOG_KEY,
          host: env.POSTHOG_HOST,
        }),
        productId: product.id,
        defer: c.var.defer,
      })
    : undefined;
  return createAuth(
    db,
    {
      appName: product.name,
      baseURL: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
      googleClientId: env.GOOGLE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_CLIENT_SECRET,
      appOrigin: new URL(env.APP_URL).origin,
      cookieDomain: env.AUTH_COOKIE_DOMAIN,
    },
    async (input) => {
      const headers = input.request?.headers ?? new Headers();
      await limitMagicLink(input.email, headers);
      await sendMagicLinkEmail(
        input,
        {
          apiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM,
          copy: messages[localeFromHeaders(headers)].auth,
        },
        deps.emailTransport,
      );
    },
    createOnUserCreated({
      credits: createCreditService(db),
      signupBonusCredits: product.signupBonusCredits,
      analytics,
      localeFromHeaders,
    }),
  );
}
