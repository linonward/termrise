import { randomUUID } from "node:crypto";

import type { BrowserContext } from "@playwright/test";

import { createAuth } from "@repo/auth/create-auth";
import { createCreditService } from "@repo/credits/credit-service";
import { testDb } from "@repo/db/testing/db";

import { e2eEnv } from "./e2e-env";
import product from "../../../../product.config";
import { createOnUserCreated } from "../../src/server/auth/on-user-created";

// Test-only magic link: Better Auth runs in the test process against the same
// PostgreSQL and hands the link to us instead of an email provider.
export async function magicLink(email: string) {
  let link = "";
  const auth = createAuth(
    testDb(),
    {
      appName: "Acme",
      baseURL: e2eEnv.APP_URL,
      secret: e2eEnv.BETTER_AUTH_SECRET,
      googleClientId: e2eEnv.GOOGLE_CLIENT_ID,
      googleClientSecret: e2eEnv.GOOGLE_CLIENT_SECRET,
    },
    async ({ url }) => {
      link = url;
    },
    // Same signup bonus as the app; no analytics from the test process.
    createOnUserCreated({
      credits: createCreditService(testDb()),
      signupBonusCredits: product.signupBonusCredits,
    }),
  );
  await auth.api.signInMagicLink({
    headers: new Headers({ origin: e2eEnv.APP_URL }),
    body: { email, callbackURL: "/dashboard" },
  });
  return { auth, link };
}

// Real registration against PostgreSQL through the magic-link flow; no email provider.
export async function signIn(
  context: BrowserContext,
  email = `${randomUUID()}@example.com`,
) {
  const { auth, link } = await magicLink(email);
  const response = await auth.handler(new Request(link));
  const cookie = response.headers
    .getSetCookie()
    .find((v) => v.startsWith("better-auth.session_token="))!
    .split(";")[0];
  const [name, value] = cookie.split("=");
  await context.addCookies([{ name, value, domain: "localhost", path: "/" }]);
  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  return { email, userId: session!.user.id };
}
