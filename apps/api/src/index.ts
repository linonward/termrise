import type { ExecutionContext } from "hono";

import { withRequestContext } from "@repo/observability/logger";

import { createApp } from "./app";
import type { Bindings } from "./env";

// Cloudflare Workers entry point (wrangler.jsonc).
const app = createApp();

const worker = {
  fetch: withRequestContext(
    async (request: Request, env: Bindings, ctx: ExecutionContext) =>
      app.fetch(request, env, ctx),
  ),
};

export default worker;
