import { Hono } from "hono";

import { logger } from "@repo/observability/logger";

import { apiPaymentProvider, requestBilling } from "../billing";
import { apiEnv, type AppEnv } from "../env";
import { database } from "../middleware/database";

// Called by Waffo, not the browser: no CORS, no session. Waffo retries non-2xx up to 3
// times; answer 2xx only once the event is stored and processed. The configured provider
// verifies the signature: the fake provider accepts only its own events.
export const webhooks = new Hono<AppEnv>().post(
  "/waffo",
  database,
  async (c) => {
    let event;
    try {
      event = await apiPaymentProvider(apiEnv(c.env)).verifyWebhook(c.req.raw);
    } catch {
      return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    if (!event) return c.json({ ok: true });
    try {
      await requestBilling(c).handleWebhookEvent(event);
      return c.json({ ok: true });
    } catch (error) {
      logger.error("webhook.payment_failed", {
        ...("purchaseId" in event
          ? { purchaseId: event.purchaseId }
          : { subscriptionId: event.subscriptionId }),
        eventId: event.eventId,
        error,
      });
      return c.json({ error: { code: "INTERNAL_ERROR" } }, 500);
    }
  },
);
