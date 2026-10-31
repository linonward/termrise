import type { Context } from "hono";

import { createExecutionService } from "@repo/execution/execution-service";
import { toLaunchSiteDto } from "@repo/research/launch-site-dto";
import { createLaunchSites } from "@repo/research/launch-sites";
import {
  buildNewWordBrief,
  newWordBriefFileName,
} from "@repo/research/new-word-brief";
import { toNewWordDto } from "@repo/research/new-word-dto";
import { createNewWords } from "@repo/research/new-words";
import {
  buildKeywordBrief,
  keywordBriefFileName,
} from "@repo/research/pool-brief";
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
const words = (c: Context<AppEnv>) => createNewWords({ database: c.var.db });

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
  .get("/keywords/:id/brief.md", async (c) => {
    const { keyword, checks } = await pool(c).get(c.req.param("id"));
    const markdown = buildKeywordBrief(
      keyword,
      checks,
      new Date().toISOString().slice(0, 10),
    );
    return c.body(markdown, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${keywordBriefFileName(keyword)}"`,
    });
  })
  .post("/keywords/:id/review", rateLimit("research"), async (c) => {
    const keyword = await pool(c).review(
      c.var.user.id,
      c.req.param("id"),
      await readJson(c),
    );
    // Selecting a keyword starts its product (docs/product/ux.md#products).
    const product =
      keyword.status === "selected"
        ? await createExecutionService({ database: c.var.db }).startFromKeyword(
            c.var.user.id,
            { poolKeywordId: keyword.id, name: keyword.phrase },
          )
        : null;
    return c.json({
      ...toPoolKeywordDto(keyword),
      productId: product?.id ?? null,
    });
  })
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
  )
  .get("/new-words", async (c) => {
    const result = await words(c).list(c.req.query());
    return c.json({ ...result, items: result.items.map(toNewWordDto) });
  })
  .post("/new-words/rounds", rateLimit("research"), async (c) => {
    const { round, created } = await words(c).requestRound(c.var.user.id);
    return c.json(
      toPoolRoundDto({ round, spentMicros: 0 }),
      created ? 201 : 200,
    );
  })
  .get("/new-words/:id", async (c) => {
    const { children, ...row } = await words(c).get(c.req.param("id"));
    return c.json({
      ...toNewWordDto(row),
      children: children.map((word) =>
        toNewWordDto({ word, innerCandidates: 0, roots: [] }),
      ),
    });
  })
  .post("/new-words/:id/select", rateLimit("research"), async (c) => {
    const word = await words(c).select(c.req.param("id"));
    const product = await createExecutionService({
      database: c.var.db,
    }).startFromKeyword(c.var.user.id, {
      newWordId: word.id,
      name: word.phrase,
    });
    return c.json({ productId: product.id });
  })
  .get("/new-words/:id/brief.md", async (c) => {
    const { word, roots, children } = await words(c).get(c.req.param("id"));
    return c.body(buildNewWordBrief(word, roots, children), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${newWordBriefFileName(word)}"`,
    });
  })
  .put("/new-words/:id/hide", rateLimit("research"), async (c) => {
    await words(c).hide(c.req.param("id"), true);
    return c.json({ hidden: true });
  })
  .delete("/new-words/:id/hide", rateLimit("research"), async (c) => {
    await words(c).hide(c.req.param("id"), false);
    return c.json({ hidden: false });
  })
  .get("/launch-sites", async (c) => {
    const result = await createLaunchSites({ database: c.var.db }).list(
      c.req.query(),
    );
    return c.json({
      ...result,
      items: result.items.map(toLaunchSiteDto),
      lastRound: result.lastRound
        ? {
            status: result.lastRound.status,
            createdAt: result.lastRound.createdAt.toISOString(),
          }
        : null,
    });
  })
  .put("/launch-sites/:id/hide", rateLimit("research"), async (c) => {
    await createLaunchSites({ database: c.var.db }).hide(
      c.req.param("id"),
      true,
    );
    return c.json({ hidden: true });
  })
  .delete("/launch-sites/:id/hide", rateLimit("research"), async (c) => {
    await createLaunchSites({ database: c.var.db }).hide(
      c.req.param("id"),
      false,
    );
    return c.json({ hidden: false });
  });
