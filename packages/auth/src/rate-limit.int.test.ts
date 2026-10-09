import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { AppError } from "@repo/observability/errors";

import { createRateLimitService } from "./rate-limit";

beforeEach(resetDb);
afterAll(closeTestDb);

const at = (iso: string) => () => new Date(iso);

it("allows up to the limit within one fixed window, then rejects with Retry-After", async () => {
  const limiter = createRateLimitService(testDb(), at("2026-10-05T10:00:15Z"));
  for (let i = 0; i < 3; i++) await limiter.enforce("upload:u1", 3, 60);
  const error = await limiter.enforce("upload:u1", 3, 60).catch((e) => e);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 45 });
});

it("starts a new window and keeps keys independent", async () => {
  const first = createRateLimitService(testDb(), at("2026-10-05T10:00:59Z"));
  await first.enforce("upload:u1", 1, 60);
  await first.enforce("upload:u2", 1, 60);
  await expect(first.enforce("upload:u1", 1, 60)).rejects.toThrow(AppError);
  const next = createRateLimitService(testDb(), at("2026-10-05T10:01:00Z"));
  await expect(next.enforce("upload:u1", 1, 60)).resolves.toBeUndefined();
});

it("counts concurrent requests atomically", async () => {
  const limiter = createRateLimitService(testDb(), at("2026-10-05T10:00:00Z"));
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => limiter.enforce("upload:u1", 4, 60)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
});
