import { createSites } from "@repo/execution/sites";
import { AppError } from "@repo/observability/errors";

import { userRoutes } from "./user-routes";

const iso = (d: Date | null) => d?.toISOString() ?? null;

type Item = Awaited<ReturnType<ReturnType<typeof createSites>["list"]>>[number];
const toDto = (s: Item) => ({
  ...s,
  lastCheckAt: iso(s.lastCheckAt),
  alertSince: iso(s.alertSince),
  syncedAt: s.syncedAt.toISOString(),
});

// The maintainer's live sites, copied from site-ops (docs/architecture/data-model.md#sites).
export const siteRoutes = userRoutes()
  .get("/", async (c) => {
    const sites = createSites({ database: c.var.db });
    const [items, heartbeats] = await Promise.all([
      sites.list(),
      sites.heartbeats(),
    ]);
    return c.json({
      items: items.map(toDto),
      heartbeats: heartbeats.map((h) => ({
        source: h.source,
        state: h.state,
        reason: h.reason,
        syncedAt: h.syncedAt.toISOString(),
      })),
    });
  })
  .get("/:domain", async (c) => {
    const detail = await createSites({ database: c.var.db }).detail(
      c.req.param("domain"),
    );
    if (!detail) throw new AppError("NOT_FOUND", "Site not found");
    return c.json({
      ...toDto(detail),
      removedAt: iso(detail.removedAt),
      days: detail.days,
    });
  });
