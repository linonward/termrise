import { afterAll, beforeEach, expect, it } from "vitest";

import { apiUsage, poolRounds, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import {
  createProviderStatus,
  toProviderStatusDto,
  WORKER_OFFLINE_MS,
} from "./provider-status";
import { createResearchService } from "./research-service";

const db = testDb();
const service = createResearchService({ database: db });
let clock = new Date("2026-10-10T08:00:00Z");
const status = createProviderStatus({ database: db, now: () => clock });

const worker = {
  workerId: "w1",
  keywordProvider: "dataforseo",
  analystProvider: "deepseek",
  analystModel: "deepseek-flash",
  radarSources: ["hacker_news"],
};

beforeEach(async () => {
  clock = new Date("2026-10-10T08:00:00Z");
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

it("shows the worker online until it stops writing, and keeps its start time", async () => {
  expect((await status.forUser("a")).worker).toBeNull();
  await status.heartbeat(worker);
  clock = new Date(clock.getTime() + 60_000);
  await status.heartbeat(worker);
  const online = toProviderStatusDto(await status.forUser("a")).worker;
  expect(online).toEqual({
    online: true,
    lastSeenAt: "2026-10-10T08:01:00.000Z",
    keywordProvider: "dataforseo",
    analystProvider: "deepseek",
    analystModel: "deepseek-flash",
    radarSources: ["hacker_news"],
    budgets: null,
  });
  clock = new Date(clock.getTime() + WORKER_OFFLINE_MS);
  expect((await status.forUser("a")).worker).toMatchObject({
    online: false,
    startedAt: new Date("2026-10-10T08:00:00Z"),
  });
});

it("sums a user's calls per provider, with the last result", async () => {
  const mine = await service.create("a", { name: "P", seeds: ["x"] });
  const theirs = await service.create("b", { name: "Q", seeds: ["y"] });
  const row = (
    projectId: string,
    status: "settled" | "failed" | "reserved" | "released",
    minute: number,
    cost: number | null = null,
  ) => ({
    projectId,
    kind: "data" as const,
    provider: "dataforseo",
    operation: "expand",
    reservedMicros: 100_000,
    costMicros: cost,
    status,
    createdAt: new Date(`2026-10-10T08:0${minute}:00Z`),
  });
  await db.insert(apiUsage).values([
    row(mine.id, "settled", 1, 75_000),
    row(mine.id, "settled", 2, 75_000),
    row(mine.id, "failed", 3),
    // Refused key: a failure that holds nothing.
    row(mine.id, "released", 4, 0),
    row(theirs.id, "settled", 5, 75_000),
  ]);
  const { usage } = toProviderStatusDto(await status.forUser("a"));
  expect(usage).toEqual([
    {
      provider: "dataforseo",
      kind: "data",
      calls: 4,
      failed: 2,
      spentUsd: 0.15,
      heldUsd: 0.1,
      lastCallAt: "2026-10-10T08:04:00.000Z",
      lastStatus: "released",
    },
  ]);
  expect((await status.forUser("b")).usage[0].calls).toBe(1);
});

it("reports the worker's budgets and the pool's spending today and this month", async () => {
  const at = new Date();
  const status = createProviderStatus({ database: db, now: () => at });
  await status.heartbeat({
    workerId: "budgets",
    keywordProvider: "fake",
    analystProvider: "fake",
    analystModel: null,
    radarSources: [],
    budgets: {
      monthly: { data: 10, ai: 2 },
      evergreen: { enabled: true, everyDays: 7, dailyData: 0.5 },
      newWords: { enabled: true, dailyData: 0.25, dailyAi: 0.05, checks: 6 },
    },
  });
  const [round] = await db
    .insert(poolRounds)
    .values({ kind: "new_words" })
    .returning();
  await db.insert(apiUsage).values({
    poolRoundId: round.id,
    kind: "data",
    provider: "fake",
    operation: "compare",
    reservedMicros: 20_000,
    costMicros: 11_000,
    status: "settled",
  });
  const dto = toProviderStatusDto(await status.forUser("nobody"));
  expect(dto.worker?.budgets?.evergreen.everyDays).toBe(7);
  expect(dto.poolSpend).toEqual([
    { bucket: "new_words", kind: "data", todayUsd: 0.011, monthUsd: 0.011 },
  ]);
  expect(dto.monthUsd.data).toBeCloseTo(0.011);
});
