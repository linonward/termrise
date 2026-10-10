import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

const { call, signIn } = createTestClient({
  PAYMENT_PROVIDER: "fake",
  ALLOW_FAKE_PROVIDERS: "1",
});

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("billing@example.com");
});
afterAll(closeTestDb);

const post = (path: string, body?: unknown, headers = { cookie }) =>
  call(path, {
    method: "POST",
    headers: {
      Origin: TEST_APP_URL,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = (path: string) => call(path, { headers: { cookie } });

it("starts a pack checkout that returns to the web app and lists the purchase", async () => {
  const checkout = await post("/api/checkout", { packId: "starter" });
  expect(checkout.status).toBe(201);
  expect(checkout.headers.get("Access-Control-Allow-Origin")).toBe(
    TEST_APP_URL,
  );
  // The fake provider "redirects" straight to the success URL.
  expect((await checkout.json()).checkoutUrl).toBe(
    `${TEST_APP_URL}/billing?checkout=success`,
  );
  const { purchases } = await (await get("/api/billing/purchases")).json();
  expect(purchases).toMatchObject([{ packId: "starter", status: "PENDING" }]);
  expect(purchases[0]).not.toHaveProperty("providerSessionId");
});

it("rejects an unknown pack", async () => {
  const response = await post("/api/checkout", { packId: "enterprise" });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_INPUT");
});

it("lists the credit activity and rejects a cursor it did not issue", async () => {
  const body = await (await get("/api/billing/credit-activity")).json();
  expect(body).toMatchObject({
    nextCursor: null,
    transactions: [{ type: "SIGNUP_BONUS", amount: 10, balanceAfter: 10 }],
  });
  expect((await get("/api/billing/credit-activity?cursor=nope")).status).toBe(
    400,
  );
});

it("answers 404 when there is no subscription to cancel", async () => {
  const response = await post("/api/billing/subscription/cancel");
  expect(response.status).toBe(404);
  expect((await response.json()).error.code).toBe("SUBSCRIPTION_NOT_FOUND");
});

it("needs a session", async () => {
  expect(
    (await post("/api/checkout", { packId: "starter" }, {} as never)).status,
  ).toBe(401);
  expect((await call("/api/billing/purchases")).status).toBe(401);
});

it("allows ten checkouts a minute, then answers 429", async () => {
  for (let i = 0; i < 10; i++)
    expect((await post("/api/checkout", { packId: "starter" })).status).toBe(
      201,
    );
  const limited = await post("/api/checkout", { packId: "starter" });
  expect(limited.status).toBe(429);
  // Cancel shares the numbers under its own key, not the count.
  expect((await post("/api/billing/subscription/cancel")).status).toBe(404);
});
