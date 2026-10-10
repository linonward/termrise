import type { Context } from "hono";

import { AppError } from "@repo/observability/errors";

import type { AppEnv } from "./env";

/** The JSON body, or 400 INVALID_INPUT. */
export async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError("INVALID_INPUT", "Body must be JSON");
  }
}
