import { createExpenses } from "@repo/execution/money";

import { readJson } from "../http";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

type Row = Awaited<ReturnType<ReturnType<typeof createExpenses>["add"]>>;
const toDto = (e: Row) => ({
  id: e.id,
  paidOn: e.paidOn,
  amountMinor: e.amountMinor,
  currency: e.currency,
  category: e.category,
  note: e.note,
  domain: e.domain,
  createdAt: e.createdAt.toISOString(),
});

// Payments outside the API ledger (docs/architecture/data-model.md#expenses), written by
// the maintainer or an agent with its token.
export const expenseRoutes = userRoutes()
  .get("/", async (c) => {
    const { month, items, totals } = await createExpenses({
      database: c.var.db,
    }).month(c.req.query("month"));
    return c.json({ month, items: items.map(toDto), totals });
  })
  .post("/", rateLimit("research"), async (c) => {
    const row = await createExpenses({ database: c.var.db }).add(
      c.var.user.id,
      await readJson(c),
    );
    return c.json(toDto(row), 201);
  })
  .delete("/:id", rateLimit("research"), async (c) => {
    await createExpenses({ database: c.var.db }).remove(c.req.param("id"));
    return c.body(null, 204);
  });
