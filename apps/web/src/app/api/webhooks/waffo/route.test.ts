import { afterEach, expect, it, vi } from "vitest";

import { fakeWebhookRequest } from "@repo/billing/adapters/fake";
import { logger } from "@repo/observability/logger";

import { POST } from "./route";

// Waffo retries only non-2xx answers: a failed event must not answer 200.
const handleWebhookEvent = vi.fn();
vi.mock("@/server/billing/billing", () => ({
  getBillingService: () => ({ handleWebhookEvent }),
}));
vi.mock("@/server/billing/provider", async () => {
  const { createFakePaymentProvider } =
    await import("@repo/billing/adapters/fake");
  const provider = createFakePaymentProvider();
  return { getPaymentProvider: () => provider };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const paid = {
  type: "payment.succeeded",
  eventId: "evt_1",
  purchaseId: "p1",
  providerOrderId: "ord_1",
};

it("answers 200 once the event is processed", async () => {
  handleWebhookEvent.mockResolvedValue(undefined);
  const response = await POST(fakeWebhookRequest(paid));
  expect(response.status).toBe(200);
  expect(handleWebhookEvent).toHaveBeenCalledWith(
    expect.objectContaining({ eventId: "evt_1", purchaseId: "p1" }),
  );
});

it("answers 500 when processing fails, so the provider retries", async () => {
  handleWebhookEvent.mockRejectedValue(new Error("database down"));
  const error = vi.spyOn(logger, "error").mockImplementation(() => {});
  const response = await POST(fakeWebhookRequest(paid));
  expect(response.status).toBe(500);
  expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
  expect(error).toHaveBeenCalledWith(
    "webhook.payment_failed",
    expect.objectContaining({ purchaseId: "p1", eventId: "evt_1" }),
  );
});

it("logs the subscription id when a subscription event fails", async () => {
  handleWebhookEvent.mockRejectedValue(new Error("database down"));
  const error = vi.spyOn(logger, "error").mockImplementation(() => {});
  const response = await POST(
    fakeWebhookRequest({
      type: "subscription.payment_succeeded",
      eventId: "evt_2",
      subscriptionId: "s1",
      providerOrderId: "ord_2",
    }),
  );
  expect(response.status).toBe(500);
  expect(error).toHaveBeenCalledWith(
    "webhook.payment_failed",
    expect.objectContaining({ subscriptionId: "s1", eventId: "evt_2" }),
  );
});

it("answers 200 to an event type it does not handle, without processing it", async () => {
  const response = await POST(
    fakeWebhookRequest({ ...paid, type: "payment.created" }),
  );
  expect(response.status).toBe(200);
  expect(handleWebhookEvent).not.toHaveBeenCalled();
});

it("answers 401 to an unsigned event, without processing it", async () => {
  const response = await POST(fakeWebhookRequest(paid, { signature: "bad" }));
  expect(response.status).toBe(401);
  expect(handleWebhookEvent).not.toHaveBeenCalled();
});
