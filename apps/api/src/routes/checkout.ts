import { requestBilling } from "../billing";
import { readJson } from "../http";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

// A Credit Pack or a subscription checkout (docs/architecture/billing.md).
export const checkout = userRoutes().post(
  "/",
  rateLimit("checkout"),
  async (c) =>
    c.json(
      await requestBilling(c).createCheckout(c.var.user, await readJson(c)),
      201,
    ),
);
