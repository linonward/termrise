import type { Context } from "hono";

import { createOpportunityDecisions } from "@repo/research/opportunity-decisions";
import { createOpportunityResults } from "@repo/research/opportunity-results";
import {
  toDecisionDto,
  toExperimentDto,
  toKeywordDto,
  toOpportunityDto,
  toSerpDto,
  toSourceSignalDto,
} from "@repo/research/research-dto";

import type { AppEnv } from "../env";
import { readJson } from "../http";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

const results = (c: Context<AppEnv>) =>
  createOpportunityResults({ database: c.var.db });
const decisions = (c: Context<AppEnv>) =>
  createOpportunityDecisions({ database: c.var.db });

// Ranked opportunities from research runs, and the owner's decisions and experiments
// (docs/architecture/termrise.md). Writes share the research limit.
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
      decisions: detail.decisions.map(toDecisionDto),
      experiments: detail.experiments.map(toExperimentDto),
    });
  })
  .post("/:id/decisions", rateLimit("research"), async (c) => {
    const decision = await decisions(c).decide(
      c.var.user.id,
      c.req.param("id"),
      await readJson(c),
    );
    return c.json({ id: decision.id, decision: decision.decision }, 201);
  })
  .post("/:id/experiments", rateLimit("research"), async (c) => {
    const experiment = await decisions(c).addExperiment(
      c.var.user.id,
      c.req.param("id"),
      await readJson(c),
    );
    return c.json(toExperimentDto(experiment), 201);
  })
  .patch("/:id/experiments/:experimentId", rateLimit("research"), async (c) =>
    c.json(
      toExperimentDto(
        await decisions(c).updateExperiment(
          c.var.user.id,
          c.req.param("id"),
          c.req.param("experimentId"),
          await readJson(c),
        ),
      ),
    ),
  );
