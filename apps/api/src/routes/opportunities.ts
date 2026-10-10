import type { Context } from "hono";

import { createOpportunityResults } from "@repo/research/opportunity-results";
import {
  toKeywordDto,
  toOpportunityDto,
  toSerpDto,
  toSourceSignalDto,
} from "@repo/research/research-dto";

import type { AppEnv } from "../env";
import { userRoutes } from "./user-routes";

const results = (c: Context<AppEnv>) =>
  createOpportunityResults({ database: c.var.db });

// Ranked opportunities from research runs (docs/architecture/termrise.md). Read only.
export const opportunityRoutes = userRoutes()
  .get("/", async (c) => {
    const items = await results(c).list(
      c.var.user.id,
      c.req.query("projectId"),
    );
    return c.json({ items: items.map(toOpportunityDto) });
  })
  .get("/:id", async (c) => {
    const detail = await results(c).get(c.var.user.id, c.req.param("id"));
    return c.json({
      ...toOpportunityDto(detail),
      keywords: detail.keywords.map(toKeywordDto),
      serps: detail.serps.map(toSerpDto),
      signals: detail.signals.map(toSourceSignalDto),
    });
  });
