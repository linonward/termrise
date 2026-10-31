import { logger } from "@repo/observability/logger";
import type { createNewWords } from "@repo/research/new-words";
import type { createPoolRounds } from "@repo/research/pool-round";

type Rounds = Pick<
  ReturnType<typeof createPoolRounds>,
  "scheduleDaily" | "failStale" | "claim" | "run"
>;

// The keyword pool's rounds (docs/product/keyword-pool.md#rounds). One scan runs at most
// one round; a round is claimed with a row lock, so two workers never run the same one.
export function poolProcessors(deps: {
  rounds?: Rounds;
  /** The UTC hour from which today's daily round is queued; none when off. */
  dailyHourUtc?: number;
  /** Days between scheduled evergreen rounds. */
  everyDays?: number;
  newWords?: Pick<
    ReturnType<typeof createNewWords>,
    "scheduleDaily" | "failStale" | "claim" | "run"
  >;
  /** The UTC hour from which today's new-words round is queued; none when off. */
  newWordsHourUtc?: number;
}) {
  return {
    async "pool.scan"() {
      if (!deps.rounds) throw new Error("Keyword pool rounds are disabled");
      const stale = await deps.rounds.failStale();
      if (stale.length > 0)
        logger.warn("pool.stale_rounds_failed", { count: stale.length });
      if (deps.dailyHourUtc !== undefined)
        await deps.rounds.scheduleDaily(deps.dailyHourUtc, deps.everyDays ?? 1);
      const round = await deps.rounds.claim();
      if (round) {
        const done = await deps.rounds.run(round);
        logger.info("pool.round_executed", {
          roundId: round.id,
          status: done.status,
        });
      }
      if (!deps.newWords) return;
      await deps.newWords.failStale();
      if (deps.newWordsHourUtc !== undefined)
        await deps.newWords.scheduleDaily(deps.newWordsHourUtc);
      const words = await deps.newWords.claim();
      if (!words) return;
      const done = await deps.newWords.run(words);
      logger.info("newwords.round_executed", {
        roundId: words.id,
        status: done.status,
      });
    },
  };
}
