import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createProviderStatus } from "@repo/research/provider-status";

import { createTestClient } from "../testing/client";

const { call, signIn } = createTestClient();

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("owner@example.com");
});
afterAll(closeTestDb);

it("shows the worker's services and the user's spending", async () => {
  await createProviderStatus({ database: testDb() }).heartbeat({
    workerId: "w1",
    keywordProvider: "fake",
    analystProvider: "fake",
    analystModel: null,
    radarEnabled: false,
  });
  const response = await call("/api/settings/providers", {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    worker: { online: true, keywordProvider: "fake", radarEnabled: false },
    radar: { items: 0, lastCollectedAt: null },
    usage: [],
  });
});

it("needs a session", async () => {
  expect((await call("/api/settings/providers")).status).toBe(401);
});
