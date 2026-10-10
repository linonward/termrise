import { Hono } from "hono";

import type { AppEnv } from "../env";
import { database } from "../middleware/database";
import { session } from "../middleware/session";
import { webCors } from "../middleware/web-cors";
import { webCsrf } from "../middleware/web-csrf";

/** Base for routes the web app calls for a signed-in user (docs/architecture/api.md#api-surface). */
export const userRoutes = () =>
  new Hono<AppEnv>()
    .use("*", webCors)
    .use("*", webCsrf)
    .use("*", database)
    .use("*", session);
