import { logger } from "@repo/observability/logger";
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
}) {
  return {
    async "pool.scan"() {
      if (!deps.rounds) throw new Error("Keyword pool rounds are disabled");
      const stale = await deps.rounds.failStale();
      if (stale.length > 0)
        logger.warn("pool.stale_rounds_failed", { count: stale.length });
      if (deps.dailyHourUtc !== undefined)
        await deps.rounds.scheduleDaily(deps.dailyHourUtc);
      const round = await deps.rounds.claim();
      if (!round) return;
      const done = await deps.rounds.run(round);
      logger.info("pool.round_executed", {
        roundId: round.id,
        status: done.status,
      });
    },
  };
}
