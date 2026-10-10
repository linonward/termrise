import { testDb } from "@repo/db/testing/db";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";
import { createFakeKeywordProvider } from "@repo/research/adapters/fake-keywords";
import { createResearchRunner } from "@repo/research/research-runner";

/** Does what apps/worker does: executes every queued research run, with fake providers. */
export async function runQueuedResearch() {
  const runner = createResearchRunner({
    database: testDb(),
    provider: createFakeKeywordProvider(),
    analyst: createFakeAnalyst(),
  });
  for (const id of await runner.pendingRunIds()) await runner.execute(id);
}
