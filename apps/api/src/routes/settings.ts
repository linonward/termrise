import { createAgentTokens } from "@repo/auth/agent-tokens";
import {
  createProviderStatus,
  toProviderStatusDto,
} from "@repo/research/provider-status";

import { readJson } from "../http";
import { userRoutes } from "./user-routes";

const tokenDto = (t: {
  id: string;
  name: string;
  preview: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}) => ({
  id: t.id,
  name: t.name,
  preview: t.preview,
  createdAt: t.createdAt.toISOString(),
  lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  revokedAt: t.revokedAt?.toISOString() ?? null,
});

// The services the worker runs and what the user's projects spent on each provider
// (docs/architecture/data-model.md#worker-heartbeats), and the user's agent tokens
// (docs/architecture/security.md#agent-tokens).
export const settingsRoutes = userRoutes()
  .get("/providers", async (c) =>
    c.json(
      toProviderStatusDto(
        await createProviderStatus({ database: c.var.db }).forUser(
          c.var.user.id,
        ),
      ),
    ),
  )
  .get("/agent-tokens", async (c) => {
    const items = await createAgentTokens({ database: c.var.db }).list(
      c.var.user.id,
    );
    return c.json({ items: items.map(tokenDto) });
  })
  .post("/agent-tokens", async (c) => {
    const body = (await readJson(c)) as { name?: unknown };
    const created = await createAgentTokens({ database: c.var.db }).create(
      c.var.user.id,
      body?.name,
    );
    return c.json({ ...tokenDto(created), token: created.token }, 201);
  })
  .delete("/agent-tokens/:id", async (c) => {
    await createAgentTokens({ database: c.var.db }).revoke(
      c.var.user.id,
      c.req.param("id"),
    );
    return c.body(null, 204);
  });
