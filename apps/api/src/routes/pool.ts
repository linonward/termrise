import type { Context } from "hono";

import {
  toPoolCheckDto,
  toPoolKeywordDto,
  toPoolRoundDto,
} from "@repo/research/pool-dto";
import { createKeywordPool } from "@repo/research/pool-service";

import type { AppEnv } from "../env";
import { readJson } from "../http";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

const pool = (c: Context<AppEnv>) => createKeywordPool({ database: c.var.db });

// The keyword pool (docs/product/keyword-pool.md): the same pool for every signed-in
// user. Rounds are queued here and run by the worker. Writes share the research limit.
export const poolRoutes = userRoutes()
  .get("/keywords", async (c) => {
    const result = await pool(c).list(c.req.query());
    return c.json({ ...result, items: result.items.map(toPoolKeywordDto) });
  })
  .post("/keywords", rateLimit("research"), async (c) => {
    const { added, existing } = await pool(c).add(
      c.var.user.id,
      await readJson(c),
    );
    return c.json({ added: added.map(toPoolKeywordDto), existing }, 201);
  })
  .get("/keywords/:id", async (c) => {
    const { keyword, checks } = await pool(c).get(c.req.param("id"));
    return c.json({
      ...toPoolKeywordDto(keyword),
      checks: checks.map(toPoolCheckDto),
    });
  })
  .post("/keywords/:id/review", rateLimit("research"), async (c) =>
    c.json(
      toPoolKeywordDto(
        await pool(c).review(
          c.var.user.id,
          c.req.param("id"),
          await readJson(c),
        ),
      ),
    ),
  )
  .get("/rounds", async (c) =>
    c.json({ items: (await pool(c).rounds()).map(toPoolRoundDto) }),
  )
  .post("/rounds", rateLimit("research"), async (c) => {
    const { round, created } = await pool(c).requestRound(
      c.var.user.id,
      await readJson(c).catch(() => ({})),
    );
    return c.json(
      toPoolRoundDto({ round, spentMicros: 0 }),
      created ? 201 : 200,
    );
  })
  .get("/rounds/:id", async (c) =>
    c.json(toPoolRoundDto(await pool(c).getRound(c.req.param("id")))),
  );
