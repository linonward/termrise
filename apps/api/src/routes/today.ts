import { toNewWordDto } from "@repo/research/new-word-dto";
import { toPoolKeywordDto, toPoolRoundDto } from "@repo/research/pool-dto";
import { createToday } from "@repo/research/today";

import { userRoutes } from "./user-routes";

// The Today page (docs/product/ux.md#today): one read for the signed-in maintainer.
export const todayRoutes = userRoutes().get("/", async (c) => {
  const s = await createToday({ database: c.var.db }).summary();
  const round = (r: typeof s.evergreenRound) =>
    r ? toPoolRoundDto({ round: r, spentMicros: 0 }) : null;
  return c.json({
    newWords: s.newWords.map((word) =>
      toNewWordDto({ word, innerCandidates: 0, roots: [] }),
    ),
    newWordCounts: s.newWordCounts,
    candidates: s.candidates.map(toPoolKeywordDto),
    waiting: s.waiting,
    evergreenRound: round(s.evergreenRound),
    newWordsRound: round(s.newWordsRound),
    spend: s.spend,
    worker: s.worker
      ? {
          lastSeenAt: s.worker.lastSeenAt.toISOString(),
          online: s.worker.online,
        }
      : null,
  });
});
