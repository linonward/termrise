import type { Context } from "hono";

import type { AppEnv } from "./env";
import { requestTasks } from "./tasks";

// The only place platform routes (credits, billing) reach the product's paid action, as
// apps/web/src/server/product.ts does in the web app. Replacing the example changes this file.

/** Runs before a balance read: timed-out paid records refund first. */
export const beforeBalanceRead = (c: Context<AppEnv>, userId: string) =>
  requestTasks(c).failStaleTasks(userId);
