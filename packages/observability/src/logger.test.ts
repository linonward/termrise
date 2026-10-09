import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, expect, it, vi } from "vitest";

import { AppError } from "./errors";
import { logger, setErrorReporter, withRequestContext } from "./logger";

const Sentry = { captureException: vi.fn() };
setErrorReporter(Sentry.captureException);

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function capture(method: "log" | "warn" | "error") {
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  return () => spy.mock.calls.map(([line]) => JSON.parse(line as string));
}

it("writes one JSON line with level, time and eventType", () => {
  const lines = capture("log");
  logger.info("task.created", { taskId: "g1", userId: "u1" });
  expect(lines()).toEqual([
    {
      level: "info",
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      eventType: "task.created",
      taskId: "g1",
      userId: "u1",
    },
  ]);
});

it("adds the requestId of the current request", async () => {
  const lines = capture("warn");
  const request = new Request("http://test", {
    headers: { "x-vercel-id": "iad1::abc" },
  });
  await withRequestContext(async () => {
    await Promise.resolve();
    logger.warn("billing.unknown_purchase", { purchaseId: "p1" });
  })(request);
  expect(lines()[0]).toMatchObject({ requestId: "iad1::abc" });
});

it("creates a requestId when the platform does not send one", async () => {
  const lines = capture("log");
  const handler = withRequestContext(async () => logger.info("x"));
  await handler(new Request("http://test"));
  await handler(new Request("http://test"));
  const [a, b] = lines();
  expect(a.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(b.requestId).not.toBe(a.requestId);
});

it("serializes errors with their code", () => {
  const lines = capture("error");
  logger.error("webhook.payment_failed", {
    providerJobId: "j1",
    error: new AppError("STORAGE_ERROR", "copy failed"),
  });
  expect(lines()[0]).toMatchObject({
    level: "error",
    providerJobId: "j1",
    error: {
      name: expect.any(String),
      message: "copy failed",
      code: "STORAGE_ERROR",
      stack: expect.any(String),
    },
  });
});

it("never writes emails, prompts or secrets", () => {
  const lines = capture("log");
  logger.info("test", {
    email: "a@example.com",
    prompt: "a full prompt",
    apiKey: "k",
    token: "t",
    secret: "s",
    password: "p",
    authorization: "Bearer x",
    userId: "u1",
  });
  expect(lines()[0]).toEqual({
    level: "info",
    time: expect.any(String),
    eventType: "test",
    email: "[redacted]",
    prompt: "[redacted]",
    apiKey: "[redacted]",
    token: "[redacted]",
    secret: "[redacted]",
    password: "[redacted]",
    authorization: "[redacted]",
    userId: "u1",
  });
});

it("reports errors to Sentry with the eventType and ids, without redacted fields", async () => {
  capture("error");
  const error = new AppError("PROVIDER_ERROR", "fal failed");
  await withRequestContext(async () =>
    logger.error("task.failed", {
      taskId: "g1",
      email: "a@example.com",
      error,
    }),
  )(new Request("http://test", { headers: { "x-vercel-id": "r1" } }));
  expect(Sentry.captureException).toHaveBeenCalledWith(error, {
    tags: { eventType: "task.failed", requestId: "r1" },
    extra: { taskId: "g1", email: "[redacted]" },
  });
});

it("reports a synthetic error when no error object is given", () => {
  capture("error");
  logger.error("billing.refund_shortfall", { purchaseId: "p1" });
  expect(Sentry.captureException).toHaveBeenCalledWith(
    new Error("billing.refund_shortfall"),
    expect.objectContaining({ extra: { purchaseId: "p1" } }),
  );
});

it("does not report info and warn logs", () => {
  capture("log");
  capture("warn");
  logger.info("a");
  logger.warn("b");
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

it("does not write SQL parameter values from failed queries", () => {
  const lines = capture("error");
  logger.error("http.unhandled_error", {
    error: new DrizzleQueryError(
      "select * from users where email = $1",
      ["private@example.com"],
      new Error("timeout"),
    ),
  });
  expect(JSON.stringify(lines())).not.toContain("private@example.com");
  expect(lines()[0].error.message).toBe(
    "Failed query: select * from users where email = $1",
  );
});
