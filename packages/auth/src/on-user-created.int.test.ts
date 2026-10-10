import { afterAll, beforeEach, expect, it } from "vitest";

import { createFakeAnalyticsProvider } from "@repo/analytics/adapters/fake";
import { createAnalyticsService } from "@repo/analytics/analytics-service";
import { createCreditService } from "@repo/credits/credit-service";
import { analyticsConsents, creditTransactions, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createOnUserCreated } from "./on-user-created";

const db = testDb();
const credits = createCreditService(db);
const analyticsProvider = createFakeAnalyticsProvider();
const onUserCreated = createOnUserCreated({
  credits,
  signupBonusCredits: 10,
  analytics: createAnalyticsService({
    database: db,
    provider: analyticsProvider,
    productId: "acme",
  }),
  // The apps resolve the locale; this stub keeps the test independent of it.
  localeFromHeaders: (headers) =>
    /NEXT_LOCALE=zh/.test(headers.get("cookie") ?? "") ? "zh" : "en",
});

beforeEach(async () => {
  await resetDb();
  analyticsProvider.events.length = 0;
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

const signUpRequest = (cookie?: string) =>
  new Request("http://localhost/api/auth/magic-link/verify", {
    headers: cookie ? { cookie } : {},
  });

it("grants the signup bonus once, also when called again", async () => {
  await onUserCreated({ id: "a" }, signUpRequest());
  await onUserCreated({ id: "a" }, signUpRequest());
  expect(await credits.getBalance("a")).toBe(10);
  expect(await db.select().from(creditTransactions)).toMatchObject([
    { userId: "a", type: "SIGNUP_BONUS", amount: 10 },
  ]);
});

it("grants nothing when the product has no signup bonus", async () => {
  await createOnUserCreated({ credits, signupBonusCredits: 0 })({ id: "a" });
  expect(await db.select().from(creditTransactions)).toHaveLength(0);
});

it("stores the banner choice and sends signup_completed when accepted", async () => {
  await onUserCreated(
    { id: "a" },
    signUpRequest("cookie_consent=1; NEXT_LOCALE=zh"),
  );
  expect(await db.select().from(analyticsConsents)).toMatchObject([
    { userId: "a", granted: true },
  ]);
  expect(analyticsProvider.events).toEqual([
    {
      distinctId: "a",
      event: "signup_completed",
      properties: { locale: "zh", product_id: "acme" },
    },
  ]);
});

it("stores a decline and sends nothing; no choice stores nothing", async () => {
  await onUserCreated({ id: "a" }, signUpRequest("cookie_consent=0"));
  await onUserCreated({ id: "b" }, signUpRequest());
  expect(await db.select().from(analyticsConsents)).toMatchObject([
    { userId: "a", granted: false },
  ]);
  expect(analyticsProvider.events).toEqual([]);
});
