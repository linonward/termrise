import { Hono } from "hono";
import { expect, it, vi } from "vitest";

import { AppError } from "@repo/observability/errors";

import { createApp } from "./app";
import { errorHandler } from "./middleware/error-handler";
import { testBindings, testExecutionContext } from "./testing/worker";

it("reports an unreachable database as 503", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Nothing listens on port 1: the connection is refused at once.
  const env = testBindings("postgresql://postgres:postgres@localhost:1/app");
  const response = await createApp().request(
    "/api/health",
    {},
    env,
    testExecutionContext(),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "error" });
});

it("maps errors to the shared error contract", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const app = new Hono()
    .get("/limited", () => {
      throw new AppError("RATE_LIMITED", "x", 42);
    })
    .get("/broken", () => {
      throw new Error("db password is hunter2");
    })
    .onError(errorHandler);

  const limited = await app.request("/limited");
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("42");
  expect((await limited.json()).error.code).toBe("RATE_LIMITED");

  const broken = await app.request("/broken");
  expect(broken.status).toBe(500);
  expect(await broken.json()).toEqual({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  });
});
