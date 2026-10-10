import type { Context } from "hono";

import { createAuth } from "@repo/auth/create-auth";
import { sendMagicLinkEmail } from "@repo/auth/magic-link-email";
import { createMagicLinkLimiter } from "@repo/auth/magic-link-limit";
import { createOnUserCreated } from "@repo/auth/on-user-created";
import { createRateLimitService } from "@repo/auth/rate-limit";
import { localeFromHeaders } from "@repo/config/locale";
import { createCreditService } from "@repo/credits/credit-service";

import { requestAnalytics } from "./analytics";
import { apiEnv, type AppEnv } from "./env";
import { messages } from "./messages";
import product from "../../../product.config";

export type AuthDeps = {
  /** Resend transport; tests capture the email instead of sending it. */
  emailTransport?: typeof fetch;
};

/** Better Auth on this request's connection (docs/architecture/security.md#auth-on-the-api). */
export function requestAuth(c: Context<AppEnv>, deps: AuthDeps = {}) {
  const env = apiEnv(c.env);
  const db = c.var.db;
  const limitMagicLink = createMagicLinkLimiter(createRateLimitService(db), {
    // Cloudflare sets the client's address in cf-connecting-ip.
    clientIp: (headers) => headers.get("cf-connecting-ip") ?? undefined,
  });
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
      analytics: requestAnalytics(c),
      localeFromHeaders,
    }),
  );
}
