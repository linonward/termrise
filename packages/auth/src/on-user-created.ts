import {
  noAnalytics,
  type AnalyticsService,
} from "@repo/analytics/analytics-service";
import { consentFromCookies } from "@repo/analytics/consent";
import type { createCreditService } from "@repo/credits/credit-service";

import type { OnUserCreated } from "./create-auth";

// What a new account gets (Better Auth user.create.after). apps/api, apps/web and the
// E2E sign-in helper create users the same way.
export function createOnUserCreated(deps: {
  credits: ReturnType<typeof createCreditService>;
  /** product.config.ts signupBonusCredits; 0 grants nothing. */
  signupBonusCredits: number;
  analytics?: AnalyticsService;
  /** UI locale of a request, sent with signup_completed. */
  localeFromHeaders?: (headers: Headers) => string;
}): OnUserCreated {
  const analytics = deps.analytics ?? noAnalytics;
  return async (user, request) => {
    if (deps.signupBonusCredits > 0)
      await deps.credits.grantSignupBonus(user.id, deps.signupBonusCredits);
    // The sign-up request comes from the browser and carries the cookie banner choice.
    const consent = consentFromCookies(request?.headers.get("cookie"));
    if (consent === undefined) return;
    await analytics.setConsent(user.id, consent);
    await analytics.capture(user.id, "signup_completed", {
      ...(deps.localeFromHeaders && {
        locale: deps.localeFromHeaders(request?.headers ?? new Headers()),
      }),
    });
  };
}
