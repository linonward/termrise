import { testDb } from "@repo/db/testing/db";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";
import { createFakeKeywordProvider } from "@repo/research/adapters/fake-keywords";
import { createFakeSeedExtractor } from "@repo/research/adapters/fake-seeds";
import { createResearchRunner } from "@repo/research/research-runner";
import { createSeedSuggester } from "@repo/research/seed-suggestions";

/** Does what apps/worker does: executes every queued research run, with fake providers. */
export async function runQueuedResearch() {
  const runner = createResearchRunner({
    database: testDb(),
    provider: createFakeKeywordProvider(),
    analyst: createFakeAnalyst(),
  });
  for (const id of await runner.pendingRunIds()) await runner.execute(id);
}

/** Does what apps/worker does for seed suggestions, with the fake extractor. */
export async function runQueuedSeedSuggestions() {
  const suggester = createSeedSuggester({
    database: testDb(),
    extractor: createFakeSeedExtractor(),
  });
  for (const id of await suggester.pendingIds()) await suggester.execute(id);
}
