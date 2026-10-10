import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { createDeepSeekJson } from "@repo/ai/adapters/deepseek-json";
import { apiUsage, opportunityEvaluations, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createDeepSeekAnalyst } from "./adapters/deepseek-analyst";
import { createFakeKeywordProvider } from "./adapters/fake-keywords";
import { createResearchRunner } from "./research-runner";
import { createResearchService } from "./research-service";

// A full run with the DeepSeek analyst over a stub fetch: no call leaves the process.
const db = testDb();
const service = createResearchService({ database: db });

const analysis = {
  targetUser: "Team leads who run weekly meetings",
  job: "Share meeting notes without rewriting them",
  alternatives: ["Shared documents"],
  differentiation: "Notes from the calendar invite, no setup",
  pricing: "Hypothesis: $8 a month per team",
  channels: ["Search"],
  mvpScope: ["Note editor"],
  risks: ["Calendar apps add notes"],
};

function deepSeekFetch(content: string) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          id: "cmpl-1",
          object: "chat.completion",
          created: 1,
          model: "deepseek-flash",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
            prompt_cache_hit_tokens: 0,
            prompt_cache_miss_tokens: 1000,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
}

const runner = (fetch: typeof globalThis.fetch) =>
  createResearchRunner({
    database: db,
    provider: createFakeKeywordProvider(),
    analyst: createDeepSeekAnalyst(
      createDeepSeekJson({ apiKey: "sk-test", model: "deepseek-flash", fetch }),
    ),
  });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(closeTestDb);

it("stores the analysis with its model and settles the token cost", async () => {
  const fetch = deepSeekFetch(JSON.stringify(analysis));
  const { id } = await service.create("a", { name: "P", seeds: ["notes"] });
  await runner(fetch).run("a", id, { requestId: randomUUID() });

  const [evaluation] = await db.select().from(opportunityEvaluations);
  expect(evaluation).toMatchObject({
    analysis,
    analysisError: null,
    analystProvider: "deepseek",
    analystModel: "deepseek-flash",
    analystPromptVersion: "analysis-v1",
  });
  const calls = await db.select().from(apiUsage);
  // 1000 × 0.3 + 500 × 1.2 micro-USD at the peak price.
  expect(calls.find((c) => c.operation === "analyze")).toMatchObject({
    provider: "deepseek",
    status: "settled",
    reservedMicros: 3900,
    costMicros: 900,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps the score when the model answers with the wrong shape", async () => {
  const fetch = deepSeekFetch(JSON.stringify({ targetUser: "" }));
  const { id } = await service.create("a", { name: "P", seeds: ["notes"] });
  await runner(fetch).run("a", id, { requestId: randomUUID() });
  const [evaluation] = await db.select().from(opportunityEvaluations);
  expect(evaluation.analysis).toBeNull();
  expect(evaluation.analysisError).toBe("AI_INVALID_OUTPUT");
  expect(evaluation.score).toBeGreaterThan(0);
});

it("keeps the reservation counted when the call fails", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("{}", { status: 503 }),
  );
  const { id } = await service.create("a", { name: "P", seeds: ["notes"] });
  await runner(fetch).run("a", id, { requestId: randomUUID() });
  const [evaluation] = await db.select().from(opportunityEvaluations);
  expect(evaluation.analysisError).toBe("AI_ERROR");
  const call = (await db.select().from(apiUsage)).find(
    (c) => c.operation === "analyze",
  );
  expect(call).toMatchObject({ status: "failed", reservedMicros: 3900 });
});
