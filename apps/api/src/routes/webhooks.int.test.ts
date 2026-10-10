import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { fakeWebhookRequest } from "@repo/billing/adapters/fake";
import { createCreditService } from "@repo/credits/credit-service";
import { purchases } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { logger } from "@repo/observability/logger";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

// Runs the real BillingService unless a test makes processing fail.
const failProcessing = vi.fn<() => boolean>(() => false);
vi.mock("../billing", async (importOriginal) => {
  const original = await importOriginal<typeof import("../billing")>();
  return {
    ...original,
    requestBilling: (...args: Parameters<typeof original.requestBilling>) => {
      const service = original.requestBilling(...args);
      return {
        ...service,
        handleWebhookEvent: async (
          event: Parameters<typeof service.handleWebhookEvent>[0],
        ) => {
          if (failProcessing()) throw new Error("database down");
          return service.handleWebhookEvent(event);
        },
      };
    },
  };
});

const { call, signIn } = createTestClient({
  PAYMENT_PROVIDER: "fake",
  ALLOW_FAKE_PROVIDERS: "1",
});

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());
afterAll(closeTestDb);

type Event = Parameters<typeof fakeWebhookRequest>[0];
// As the provider sends it: no browser Origin, no cookie.
async function deliver(event: Event, signature?: string) {
  const request = fakeWebhookRequest(event, signature ? { signature } : {});
  return call("/api/webhooks/waffo", {
    method: "POST",
    headers: request.headers,
    body: await request.text(),
  });
}

async function pendingPurchase() {
  const cookie = await signIn("webhook@example.com", { credits: 10 });
  await call("/api/checkout", {
    method: "POST",
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ packId: "starter" }),
  });
  const [purchase] = await testDb().select().from(purchases);
  return purchase;
}

it("grants a verified payment once", async () => {
  const purchase = await pendingPurchase();
  const paid = {
    type: "payment.succeeded",
    eventId: "e1",
    purchaseId: purchase.id,
    providerOrderId: "ord_1",
  };
  expect((await deliver(paid, "forged")).status).toBe(401);
  for (let i = 0; i < 2; i++) expect((await deliver(paid)).status).toBe(200);
  expect(await createCreditService(testDb()).getBalance(purchase.userId)).toBe(
    60,
  );
});

it("answers 200 to an event type it does not handle", async () => {
  const response = await deliver({
    type: "payment.created",
    eventId: "e2",
    purchaseId: "p1",
    providerOrderId: "ord_2",
  });
  expect(response.status).toBe(200);
});

it("answers 500 when processing fails, so the provider retries", async () => {
  failProcessing.mockReturnValue(true);
  const error = vi.spyOn(logger, "error").mockImplementation(() => {});
  const response = await deliver({
    type: "subscription.payment_succeeded",
    eventId: "e3",
    subscriptionId: "s1",
    providerOrderId: "ord_3",
  });
  expect(response.status).toBe(500);
  expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
  expect(error).toHaveBeenCalledWith(
    "webhook.payment_failed",
    expect.objectContaining({ subscriptionId: "s1", eventId: "e3" }),
  );
});
