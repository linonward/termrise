import type { Context } from "hono";

import { createFavorites } from "@repo/research/favorites";
import { createRadar } from "@repo/research/radar";
import {
  toRadarItemDto,
  toRadarObservationDto,
} from "@repo/research/radar-dto";

import type { AppEnv } from "../env";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

const radar = (c: Context<AppEnv>) => createRadar({ database: c.var.db });

// Stories the worker collects from public sources (docs/architecture/data-model.md#radar).
// The same items for every signed-in user; read-only.
export const radarRoutes = userRoutes()
  .get("/items", async (c) => {
    const items = await radar(c).list(c.var.user.id, {
      q: c.req.query("q"),
      sort: c.req.query("sort"),
      starred: c.req.query("starred"),
    });
    return c.json({ items: items.map(toRadarItemDto) });
  })
  .get("/items/:id", async (c) => {
    const { item, observations } = await radar(c).get(
      c.var.user.id,
      c.req.param("id"),
    );
    return c.json({
      ...toRadarItemDto(item),
      observations: observations.map(toRadarObservationDto),
    });
  })
  .put("/items/:id/star", rateLimit("research"), async (c) =>
    c.json(
      await createFavorites({ database: c.var.db }).starRadarItem(
        c.var.user.id,
        c.req.param("id"),
        true,
      ),
    ),
  )
  .delete("/items/:id/star", rateLimit("research"), async (c) =>
    c.json(
      await createFavorites({ database: c.var.db }).starRadarItem(
        c.var.user.id,
        c.req.param("id"),
        false,
      ),
    ),
  );
