import type { Context } from "hono";

import { createRadar } from "@repo/research/radar";
import {
  toRadarItemDto,
  toRadarObservationDto,
} from "@repo/research/radar-dto";

import type { AppEnv } from "../env";
import { userRoutes } from "./user-routes";

const radar = (c: Context<AppEnv>) => createRadar({ database: c.var.db });

// Stories the worker collects from public sources (docs/architecture/data-model.md#radar).
// The same items for every signed-in user; read-only.
export const radarRoutes = userRoutes()
  .get("/items", async (c) => {
    const items = await radar(c).list({
      q: c.req.query("q"),
      sort: c.req.query("sort"),
    });
    return c.json({ items: items.map(toRadarItemDto) });
  })
  .get("/items/:id", async (c) => {
    const { item, observations } = await radar(c).get(c.req.param("id"));
    return c.json({
      ...toRadarItemDto(item),
      observations: observations.map(toRadarObservationDto),
    });
  });
