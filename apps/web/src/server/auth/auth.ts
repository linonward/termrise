import "server-only";
import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { cache } from "react";

import { createAuth } from "@repo/auth/create-auth";
import { createAuthGuards } from "@repo/auth/guards";
import { createMagicLinkLimiter } from "@repo/auth/magic-link-limit";
import { createOnUserCreated } from "@repo/auth/on-user-created";
import { createRateLimitService } from "@repo/auth/rate-limit";
import { serverEnv } from "@repo/config/env";
import { localeFromHeaders } from "@repo/config/locale";
import { db } from "@repo/db/client";

import { getAnalyticsService } from "@/server/analytics/analytics";
import { getCreditService } from "@/server/credits/credits";
import { sendMagicLinkEmail } from "@/server/email/magic-link";
import product from "@product";

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!instance) {
    const env = serverEnv();
    const limitMagicLink = createMagicLinkLimiter(createRateLimitService(db()));
    instance = createAuth(
      db(),
      {
        appName: product.name,
        baseURL: env.BETTER_AUTH_URL,
        secret: env.BETTER_AUTH_SECRET,
        googleClientId: env.GOOGLE_CLIENT_ID,
        googleClientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      async (input) => {
        await limitMagicLink(
          input.email,
          input.request?.headers ?? new Headers(),
        );
        await sendMagicLinkEmail(input, {
          apiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM,
        });
      },
      createOnUserCreated({
        credits: getCreditService(),
        signupBonusCredits: product.signupBonusCredits,
        analytics: getAnalyticsService(),
        localeFromHeaders,
      }),
    );
  }
  return instance;
}
export async function getSession(headers: Headers) {
  if (!getSessionCookie(headers)) return null;
  return getAuth().api.getSession({ headers });
}
/** Session of the current request. The dashboard layout and page share one lookup. */
export const getRequestSession = cache(async () => getSession(await headers()));
/**
 * Session of the current request when the user is in ADMIN_USER_IDS, else null.
 * Callers answer 404 so /admin does not reveal that it exists
 * (docs/architecture/security.md#admin-access).
 */
export const getAdminSession = cache(async () => {
  const session = await getRequestSession();
  return session && serverEnv().ADMIN_USER_IDS.includes(session.user.id)
    ? session
    : null;
});
export async function requireUser(headers: Headers) {
  return createAuthGuards(getAuth()).requireUser(headers);
}
