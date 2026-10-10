import { expect, it } from "vitest";

import { resolveTestDatabaseUrl } from "@repo/db/testing/test-database";

import { createApp } from "./app";
import { testBindings, testExecutionContext } from "./testing/worker";

it("answers the health check when the database is reachable", async () => {
  const ctx = testExecutionContext();
  const response = await createApp().request(
    "/api/health",
    {},
    testBindings(resolveTestDatabaseUrl()),
    ctx,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
  await ctx.settled();
});
