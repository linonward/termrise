import { eq } from "drizzle-orm";

import { createCreditService } from "@repo/credits/credit-service";
import { user } from "@repo/db/schema";
import { testDb } from "@repo/db/testing/db";
import { resolveTestDatabaseUrl } from "@repo/db/testing/test-database";

import { createApp } from "../app";
import type { Bindings } from "../env";
import {
  TEST_API_URL,
  TEST_APP_URL,
  testBindings,
  testExecutionContext,
} from "./worker";

/**
 * Calls the app as the Workers runtime does, against the test database. signIn() goes
 * through the magic link flow and returns the session cookie. Termrise grants no credits
 * at sign-up (product.config.ts): signIn(email, { credits }) grants them as a signup bonus.
 */
export function createTestClient(overrides: Partial<Bindings> = {}) {
  const emails: { subject: string; text: string }[] = [];
  const app = createApp({
    emailTransport: async (_url, init) => {
      emails.push(JSON.parse(init!.body as string));
      return new Response("{}");
    },
  });

  async function call(path: string, init: RequestInit = {}) {
    const ctx = testExecutionContext();
    const response = await app.request(
      `${TEST_API_URL}${path}`,
      init,
      testBindings(resolveTestDatabaseUrl(), overrides),
      ctx,
    );
    await ctx.settled();
    return response;
  }

  async function signIn(email: string, { credits = 0 } = {}) {
    await call("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: TEST_APP_URL },
      body: JSON.stringify({ email, callbackURL: `${TEST_APP_URL}/dashboard` }),
    });
    const link = emails.at(-1)!.text.split("\n").at(-1)!;
    const verified = await call(link.slice(TEST_API_URL.length));
    if (credits > 0) {
      const [row] = await testDb()
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email));
      await createCreditService(testDb()).grantSignupBonus(row.id, credits);
    }
    return verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }

  return { call, signIn, emails };
}
