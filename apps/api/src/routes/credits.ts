import { createCreditService } from "@repo/credits/credit-service";

import { beforeBalanceRead } from "../product";
import { userRoutes } from "./user-routes";

// The signed-in user's balance, after timed-out paid records are refunded
// (docs/architecture/tasks.md#stale-tasks); pages read it before the activity list.
export const credits = userRoutes().get("/balance", async (c) => {
  await beforeBalanceRead(c, c.var.user.id);
  const balance = await createCreditService(c.var.db).getBalance(c.var.user.id);
  return c.json({ balance });
});
