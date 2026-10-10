import type { Context } from "hono";

import {
  toResearchProjectDto,
  toSourceSignalDto,
} from "@repo/research/research-dto";
import { createResearchService } from "@repo/research/research-service";

import type { AppEnv } from "../env";
import { readJson } from "../http";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

const research = (c: Context<AppEnv>) =>
  createResearchService({ database: c.var.db });

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
  .delete("/projects/:id", rateLimit("research"), async (c) => {
    await research(c).remove(c.var.user.id, c.req.param("id"));
    return c.body(null, 204);
  });
