import { expect, it, vi } from "vitest";

import { poolProcessors } from "./pool.processor";

const rounds = (claimed: { id: string } | null) => ({
  failStale: vi.fn(async () => []),
  scheduleDaily: vi.fn(async () => null),
  claim: vi.fn(async () => claimed as never),
  run: vi.fn(async () => ({ status: "completed" }) as never),
});

it("queues the daily round only when enabled, then runs one claimed round", async () => {
  const on = rounds({ id: "r1" });
  await poolProcessors({ rounds: on, dailyHourUtc: 0 })["pool.scan"]();
  expect(on.scheduleDaily).toHaveBeenCalledWith(0, 1);
  expect(on.run).toHaveBeenCalledTimes(1);

  const off = rounds(null);
  await poolProcessors({ rounds: off })["pool.scan"]();
  expect(off.scheduleDaily).not.toHaveBeenCalled();
  expect(off.run).not.toHaveBeenCalled();
});

it("fails the job when rounds are not set up, so a stale schedule shows", async () => {
  await expect(poolProcessors({})["pool.scan"]()).rejects.toThrow();
});

it("runs a new-words round after the evergreen one", async () => {
  const words = rounds({ id: "w1" });
  await poolProcessors({
    rounds: rounds(null),
    newWords: words,
    newWordsHourUtc: 0,
  })["pool.scan"]();
  expect(words.scheduleDaily).toHaveBeenCalledWith(0);
  expect(words.run).toHaveBeenCalledTimes(1);
});
