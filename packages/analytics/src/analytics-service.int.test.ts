import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeAnalyticsProvider } from "./adapters/fake";
import { createAnalyticsService } from "./analytics-service";

const db = testDb();
let provider = createFakeAnalyticsProvider();
const service = () =>
  createAnalyticsService({ database: db, provider, productId: "acme" });

beforeEach(async () => {
  provider = createFakeAnalyticsProvider();
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterEach(() => vi.restoreAllMocks());
afterAll(closeTestDb);

it("sends nothing for users without a consent decision", async () => {
  await service().capture("a", "task_succeeded", { taskId: "t1" });
  expect(provider.events).toEqual([]);
});

it("sends events by user id only after consent, and stops after decline", async () => {
  await service().setConsent("a", true);
  await service().capture("a", "task_succeeded", { taskId: "t1" });
  expect(provider.events).toEqual([
    {
      distinctId: "a",
      event: "task_succeeded",
      properties: { taskId: "t1", product_id: "acme" },
    },
  ]);
  await service().setConsent("a", false);
  await service().capture("a", "task_failed", { errorCode: "x" });
  expect(provider.events).toHaveLength(1);
});

it("drops emails and prompts from properties", async () => {
  await service().setConsent("a", true);
  await service().capture("a", "signup_completed", {
    method: "email",
    email: "a@example.com",
    prompt: "p",
  } as never);
  expect(provider.events[0].properties).toEqual({
    method: "email",
    product_id: "acme",
  });
});

it("adds the product id to every event; callers cannot override it", async () => {
  await service().setConsent("a", true);
  await service().capture("a", "task_succeeded", { product_id: "other" });
  expect(provider.events[0].properties).toEqual({ product_id: "acme" });
});

it("never fails the caller when the provider fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await service().setConsent("a", true);
  provider.fail = true;
  await expect(
    service().capture("a", "purchase_completed", { packId: "starter" }),
  ).resolves.toBeUndefined();
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringContaining('"eventType":"analytics.capture_failed"'),
  );
});

it("rejects a consent body without a boolean", async () => {
  await expect(
    service().updateConsent("a", { granted: "yes" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await service().updateConsent("a", { granted: true });
  await service().capture("a", "signup_completed");
  expect(provider.events).toHaveLength(1);
});

it("returns before the consent lookup and send when work is deferred", async () => {
  const deferred: (() => Promise<void>)[] = [];
  const later = createAnalyticsService({
    database: db,
    provider,
    productId: "acme",
    defer: (task) => {
      deferred.push(task);
    },
  });
  await later.setConsent("a", true);
  const select = vi.spyOn(db, "select");
  await later.capture("a", "task_succeeded", { taskId: "t1" });
  expect(select).not.toHaveBeenCalled();
  expect(provider.events).toEqual([]);
  await Promise.all(deferred.map((task) => task()));
  expect(provider.events).toHaveLength(1);
});
