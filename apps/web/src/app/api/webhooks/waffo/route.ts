import { logger, withRequestContext } from "@repo/observability/logger";

import { getBillingService } from "@/server/billing/billing";
import { getPaymentProvider } from "@/server/billing/provider";

// Waffo retries non-2xx up to 3 times; answer 2xx only once the event is stored and processed.
// The configured provider verifies the signature: in tests the fake provider
// signs its own events, and a Waffo event sent to it fails with 401.
export const POST = withRequestContext(async (request: Request) => {
  const provider = getPaymentProvider();
  let event;
  try {
    event = await provider.verifyWebhook(request);
  } catch {
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (!event) return Response.json({ ok: true });
  try {
    await getBillingService().handleWebhookEvent(event);
    return Response.json({ ok: true });
  } catch (error) {
    logger.error("webhook.payment_failed", {
      ...("purchaseId" in event
        ? { purchaseId: event.purchaseId }
        : { subscriptionId: event.subscriptionId }),
      eventId: event.eventId,
      error,
    });
    return Response.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
});
