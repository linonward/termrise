import type { Context } from "hono";

import { AppError } from "@repo/observability/errors";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";
import { createFakeKeywordProvider } from "@repo/research/adapters/fake-keywords";
import {
  toKeywordDto,
  toResearchProjectDto,
  toResearchRunDto,
  toSerpDto,
  toSourceSignalDto,
} from "@repo/research/research-dto";
import { createResearchResults } from "@repo/research/research-results";
import { createResearchRunner } from "@repo/research/research-runner";
import { createResearchService } from "@repo/research/research-service";

import { apiEnv, type AppEnv } from "../env";
import { readJson } from "../http";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

const research = (c: Context<AppEnv>) =>
  createResearchService({ database: c.var.db });

// Without configured providers a run is refused, never filled with made-up data.
function runner(c: Context<AppEnv>) {
  const env = apiEnv(c.env);
  if (env.KEYWORD_PROVIDER !== "fake" || env.ANALYST_PROVIDER !== "fake")
    throw new AppError(
      "RESEARCH_PROVIDER_UNAVAILABLE",
      "No keyword or analyst provider configured",
    );
  return createResearchRunner({
    database: c.var.db,
    provider: createFakeKeywordProvider(),
    analyst: createFakeAnalyst(),
  });
}

const reader = (c: Context<AppEnv>) =>
  createResearchResults({ database: c.var.db });

// Research projects (docs/architecture/termrise.md). Writes share the research limit.
export const researchRoutes = userRoutes()
  .get("/projects", async (c) => {
    const items = await research(c).list(c.var.user.id);
    return c.json({ items: items.map(toResearchProjectDto) });
  })
  .post("/projects", rateLimit("research"), async (c) => {
    const project = await research(c).create(c.var.user.id, await readJson(c));
    return c.json(toResearchProjectDto(project), 201);
  })
  .get("/projects/:id", async (c) =>
    c.json(
      toResearchProjectDto(
        await research(c).get(c.var.user.id, c.req.param("id")),
      ),
    ),
  )
  .patch("/projects/:id", rateLimit("research"), async (c) => {
    const project = await research(c).update(
      c.var.user.id,
      c.req.param("id"),
      await readJson(c),
    );
    return c.json(toResearchProjectDto(project));
  })
  // A CSV of terms, sent as JSON { csv } (docs/product/ux.md#research).
  .post("/projects/:id/import", rateLimit("research"), async (c) =>
    c.json(
      await research(c).importCsv(
        c.var.user.id,
        c.req.param("id"),
        await readJson(c),
      ),
    ),
  )
  .get("/projects/:id/signals", async (c) => {
    const items = await research(c).listSignals(
      c.var.user.id,
      c.req.param("id"),
    );
    return c.json({ items: items.map(toSourceSignalDto) });
  })
  // Runs synchronously for now and answers with the finished run (docs/roadmap.md).
  .post("/projects/:id/runs", rateLimit("research"), async (c) =>
    c.json(
      toResearchRunDto(
        await runner(c).run(
          c.var.user.id,
          c.req.param("id"),
          await readJson(c),
        ),
      ),
      201,
    ),
  )
  .get("/projects/:id/runs", async (c) => {
    const items = await reader(c).listRuns(c.var.user.id, c.req.param("id"));
    return c.json({ items: items.map(toResearchRunDto) });
  })
  .get("/projects/:id/keywords", async (c) => {
    const items = await reader(c).listKeywords(
      c.var.user.id,
      c.req.param("id"),
    );
    return c.json({ items: items.map(toKeywordDto) });
  })
  .get("/projects/:id/serps", async (c) => {
    const items = await reader(c).listSerps(c.var.user.id, c.req.param("id"));
    return c.json({ items: items.map(toSerpDto) });
  })
  .delete("/projects/:id", rateLimit("research"), async (c) => {
    await research(c).remove(c.var.user.id, c.req.param("id"));
    return c.body(null, 204);
  });
