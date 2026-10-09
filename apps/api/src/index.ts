import { serve } from "@hono/node-server";

import { logger } from "@repo/observability/logger";

import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: createApp().fetch, port }, (info) =>
  logger.info("api.listening", { port: info.port }),
);
