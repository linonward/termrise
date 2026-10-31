import { afterAll, beforeEach, expect, it } from "vitest";

import {
  apiUsage,
  newWords,
  poolRounds,
  workerHeartbeats,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createKeywordPool } from "./pool-service";
import { createToday } from "./today";

const db = testDb();
const clock = new Date("2026-11-03T02:00:00Z");
const today = createToday({ database: db, now: () => clock });
const pool = createKeywordPool({ database: db, now: () => clock });

beforeEach(resetDb);
afterAll(closeTestDb);

it("shows today's new words, keywords waiting, latest rounds, spending and the worker", async () => {
  const day = (h: number) => new Date(clock.getTime() - h * 3_600_000);
  await db.insert(newWords).values([
    { phrase: "worth it", verdict: "worth", ratio: 0.2, checkedAt: day(3) },
    { phrase: "try it", verdict: "try", ratio: 0.5, checkedAt: day(3) },
    { phrase: "skip it", verdict: "skip", ratio: 0.9, checkedAt: day(3) },
    { phrase: "old one", verdict: "worth", ratio: 0.9, checkedAt: day(72) },
    {
      phrase: "hidden one",
      verdict: "worth",
      ratio: 0.9,
      checkedAt: day(3),
      hiddenAt: day(1),
    },
  ]);
  await pool.record({
    phrase: "cipher decoder",
    status: "candidate",
    reasons: [],
    kind: "deep",
  });
  await pool.record({
    phrase: "title case",
    status: "watch",
    reasons: [],
    kind: "deep",
  });
  await pool.record({
    phrase: "dividend",
    status: "failed",
    reasons: [],
    kind: "deep",
  });
  const [weekly, words, launches, platforms] = await db
    .insert(poolRounds)
    .values([
      { kind: "daily", status: "completed", createdAt: day(30) },
      { kind: "new_words", status: "partial", createdAt: day(2) },
      { kind: "launch_sites", status: "completed", createdAt: day(4) },
      { kind: "platform_sites", status: "completed", createdAt: day(5) },
    ])
    .returning();
  await db.insert(apiUsage).values([
    {
      poolRoundId: weekly.id,
      kind: "data",
      provider: "x",
      operation: "trend",
      reservedMicros: 1,
      costMicros: 240_000,
      status: "settled",
      createdAt: day(30),
    },
    {
      poolRoundId: words.id,
      kind: "data",
      provider: "x",
      operation: "compare",
      reservedMicros: 1,
      costMicros: 310_000,
      status: "settled",
      createdAt: day(2),
    },
    {
      poolRoundId: words.id,
      kind: "ai",
      provider: "x",
      operation: "analyze",
      reservedMicros: 1,
      costMicros: 1_000,
      status: "settled",
      createdAt: day(2),
    },
    // Launch sites draw on the new-words budget; platform sites have their own.
    {
      poolRoundId: launches.id,
      kind: "ai",
      provider: "x",
      operation: "analyze",
      reservedMicros: 1,
      costMicros: 2_000,
      status: "settled",
      createdAt: day(4),
    },
    {
      poolRoundId: platforms.id,
      kind: "data",
      provider: "x",
      operation: "traffic",
      reservedMicros: 1,
      costMicros: 48_000,
      status: "settled",
      createdAt: day(5),
    },
  ]);
  await db.insert(workerHeartbeats).values({
    workerId: "w",
    keywordProvider: "fake",
    analystProvider: "fake",
    radarSources: [],
    startedAt: day(10),
    lastSeenAt: new Date(clock.getTime() - 60_000),
  } as never);

  const s = await today.summary();
  expect(s.newWords.map((w) => w.phrase)).toEqual(["worth it", "try it"]);
  expect(s.newWordCounts).toEqual({ worth: 1, try: 1 });
  expect(s.candidates.map((k) => k.phrase).sort()).toEqual([
    "cipher decoder",
    "title case",
  ]);
  expect(s.waiting).toBe(2);
  expect(s.evergreenRound?.id).toBe(weekly.id);
  expect(s.newWordsRound?.id).toBe(words.id);
  expect(s.spend).toEqual(
    expect.arrayContaining([
      { bucket: "evergreen", kind: "data", micros: 240_000 },
      { bucket: "new_words", kind: "data", micros: 310_000 },
      { bucket: "new_words", kind: "ai", micros: 3_000 },
      { bucket: "platform", kind: "data", micros: 48_000 },
    ]),
  );
  expect(s.worker).toMatchObject({ online: true });
});
