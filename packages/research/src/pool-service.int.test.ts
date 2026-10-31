import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { apiUsage, poolRounds, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createBudget } from "./budget";
import { createKeywordPool, nextCheckAt } from "./pool-service";

const db = testDb();
let clock = new Date("2026-11-01T08:00:00Z");
const pool = createKeywordPool({ database: db, now: () => clock });
const day = (n: number) => new Date(clock.getTime() + n * 86_400_000);

beforeEach(async () => {
  clock = new Date("2026-11-01T08:00:00Z");
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(closeTestDb);

it("rechecks by the reason, and never for a decision, H4 or H7", () => {
  const at = clock;
  const fail = (rule: "H1" | "H2" | "H5" | "H6" | "H7") => [
    { rule, result: "fail" as const },
  ];
  expect(nextCheckAt("failed", fail("H6"), at)).toEqual(day(90));
  expect(nextCheckAt("failed", fail("H1"), at)).toEqual(day(180));
  expect(nextCheckAt("failed", fail("H5"), at)).toEqual(day(120));
  expect(nextCheckAt("failed", fail("H2"), at)).toBeNull();
  expect(nextCheckAt("failed", fail("H7"), at)).toBeNull();
  expect(nextCheckAt("queued", [], at)).toEqual(at);
  expect(nextCheckAt("unsure", [], at)).toEqual(day(7));
  expect(nextCheckAt("candidate", [], at)).toEqual(day(14));
  expect(nextCheckAt("selected", [], at)).toBeNull();
  expect(nextCheckAt("excluded", [], at)).toBeNull();
});

it("keeps one row per keyword, every check, and each source once", async () => {
  await pool.record({
    phrase: "Cipher  Decoder",
    source: "ranked:convertcase.net",
    status: "queued",
    reasons: [],
    kind: "screen",
    fields: { searchVolume: 14800, keywordDifficulty: 14 },
  });
  clock = day(1);
  const k = await pool.record({
    phrase: "cipher decoder",
    source: "suffix:decoder",
    status: "candidate",
    reasons: [],
    kind: "deep",
    fields: { strongCompetitors: 0 },
  });
  await pool.record({
    phrase: "cipher decoder",
    source: "suffix:decoder",
    status: "candidate",
    reasons: [],
    kind: "deep",
  });
  const { keyword, checks } = await pool.get(k.id);
  expect(keyword).toMatchObject({
    phrase: "cipher decoder",
    sources: ["ranked:convertcase.net", "suffix:decoder"],
    status: "candidate",
    searchVolume: 14800,
    strongCompetitors: 0,
    nextCheckAt: day(14),
  });
  expect(checks.map((c) => c.kind)).toEqual(["deep", "deep", "screen"]);
});

it("lists due keywords, queued first", async () => {
  await pool.record({
    phrase: "b",
    status: "unsure",
    reasons: [],
    kind: "screen",
  });
  await pool.record({
    phrase: "a",
    status: "queued",
    reasons: [],
    kind: "screen",
  });
  await pool.record({
    phrase: "c",
    status: "candidate",
    reasons: [],
    kind: "deep",
  });
  clock = day(8);
  expect((await pool.due(10)).map((k) => k.phrase)).toEqual(["a", "b"]);
});

it("lets the maintainer select only a candidate, and keeps each review", async () => {
  const k = await pool.record({
    phrase: "cipher decoder",
    status: "queued",
    reasons: [],
    kind: "screen",
  });
  await expect(
    pool.review("a", k.id, { action: "select" }),
  ).rejects.toMatchObject({
    code: "POOL_REVIEW_INVALID",
  });
  await pool.record({
    phrase: "cipher decoder",
    status: "candidate",
    reasons: [],
    kind: "deep",
  });
  const selected = await pool.review("a", k.id, { action: "select" });
  expect(selected).toMatchObject({ status: "selected", nextCheckAt: null });
  const { checks } = await pool.get(k.id);
  expect(checks[0]).toMatchObject({
    kind: "review",
    status: "selected",
    reviewerId: "a",
  });
});

it("fails a keyword on a 'no' for H4 or H7 and keeps the notes", async () => {
  const k = await pool.record({
    phrase: "odds calculator",
    status: "candidate",
    reasons: [],
    kind: "deep",
  });
  const answered = await pool.review("a", k.id, {
    action: "answer",
    monetization: { ok: false, note: "Gambling: ad networks refuse it" },
    aiAngle: "none",
  });
  expect(answered).toMatchObject({
    status: "failed",
    monetization: "Gambling: ad networks refuse it",
    aiAngle: "none",
    nextCheckAt: null,
  });
  expect(answered.reasons).toEqual([
    { rule: "H4", result: "fail", value: "Gambling: ad networks refuse it" },
  ]);
  const restored = await pool.review("a", k.id, { action: "restore" });
  expect(restored).toMatchObject({ status: "queued", reasons: [] });
});

it("adds ideas once and refuses a bad request", async () => {
  const first = await pool.add("a", {
    phrases: ["Sort Lines", "sort lines", "x"],
  });
  expect(first.added.map((k) => k.phrase)).toEqual(["sort lines", "x"]);
  expect(first.added[0]).toMatchObject({ status: "new", sources: ["idea"] });
  const again = await pool.add("a", {
    phrases: ["sort lines"],
    source: "adjacent:removedupelines",
  });
  expect(again).toMatchObject({ added: [], existing: ["sort lines"] });
  await expect(pool.add("a", { phrases: [] })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(pool.get("not-a-uuid")).rejects.toMatchObject({
    code: "POOL_KEYWORD_NOT_FOUND",
  });
});

it("queues one round at a time", async () => {
  const first = await pool.requestRound("a", { source: "suffix:Decoder" });
  expect(first).toMatchObject({
    created: true,
    round: { source: "suffix:decoder", status: "queued" },
  });
  const second = await pool.requestRound("a", {});
  expect(second).toMatchObject({
    created: false,
    round: { id: first.round.id },
  });
  await expect(
    pool.requestRound("a", { source: "rm -rf" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});

it("charges pool rounds to a daily cap shared by all rounds, reset each UTC day", async () => {
  const budget = createBudget({
    database: db,
    now: () => clock,
    dailyPoolCapMicros: 500_000,
    monthlyCapMicros: { data: 10_000_000, ai: 1_000_000 },
  });
  const [r1, r2] = await db
    .insert(poolRounds)
    .values([{ kind: "daily" }, { kind: "manual" }])
    .returning();
  const call = (roundId: string, max: number) => ({
    projectId: null,
    poolRoundId: roundId,
    runId: null,
    kind: "data" as const,
    provider: "fake",
    operation: "trend",
    maxCostMicros: max,
  });
  const paid = (cost: number) => async () => ({ value: 1, costMicros: cost });
  expect(await budget.charge(call(r1.id, 300_000), paid(250_000))).toEqual({
    value: 1,
  });
  // 250,000 spent; another 300,000 reservation would pass the cap, from either round.
  expect(await budget.charge(call(r2.id, 300_000), paid(1))).toBeNull();
  expect(budget.refusal(r2.id, "data")).toBe("daily");
  expect(await budget.charge(call(r2.id, 200_000), paid(1))).toEqual({
    value: 1,
  });
  clock = new Date("2026-11-02T00:00:01Z");
  expect(await budget.charge(call(r2.id, 300_000), paid(1))).toEqual({
    value: 1,
  });
  const rows = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.poolRoundId, r2.id));
  expect(rows.every((r) => r.projectId === null)).toBe(true);
  expect((await pool.getRound(r1.id)).spentMicros).toBe(250_000);
});

it("refuses pool calls without a daily cap", async () => {
  const budget = createBudget({ database: db, now: () => clock });
  const [round] = await db
    .insert(poolRounds)
    .values({ kind: "daily" })
    .returning();
  expect(
    await budget.charge(
      {
        projectId: null,
        poolRoundId: round.id,
        runId: null,
        kind: "data",
        provider: "fake",
        operation: "trend",
        maxCostMicros: 1,
      },
      async () => ({ value: 1, costMicros: 1 }),
    ),
  ).toBeNull();
});
