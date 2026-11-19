import {
  createDomains,
  createExpenses,
  expiringWithin,
} from "@repo/execution/money";
import { createSites } from "@repo/execution/sites";
import { toNewWordDto } from "@repo/research/new-word-dto";
import { toPoolKeywordDto, toPoolRoundDto } from "@repo/research/pool-dto";
import { createKeywordPool } from "@repo/research/pool-service";
import { createToday } from "@repo/research/today";

import { userRoutes } from "./user-routes";

// The Today page (docs/product/ux.md#today): one read for the signed-in maintainer.
export const todayRoutes = userRoutes().get("/", async (c) => {
  const now = new Date();
  const [s, siteList, heartbeats, reviews, domains, expenses] =
    await Promise.all([
      createToday({ database: c.var.db }).summary(),
      createSites({ database: c.var.db }).list(now),
      createSites({ database: c.var.db }).heartbeats(),
      // What the maintainer said to look at again within a week (vet records).
      createKeywordPool({ database: c.var.db }).reviewsDue(
        new Date(now.getTime() + 7 * 86_400_000),
      ),
      createDomains({ database: c.var.db }).list(now),
      createExpenses({ database: c.var.db }).totals(
        now.toISOString().slice(0, 7),
      ),
    ]);
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
          schedule: s.worker.schedule,
        }
      : null,
    // The live sites from site-ops: how many, which are down, when last synced.
    sites: {
      total: siteList.length,
      down: siteList
        .filter((x) => x.alertState === "down")
        .map((x) => ({
          domain: x.domain,
          name: x.name,
          since: x.alertSince?.toISOString() ?? null,
          lastStatus: x.lastStatus,
        })),
      syncedAt: siteList.length
        ? new Date(
            Math.max(...siteList.map((x) => x.syncedAt.getTime())),
          ).toISOString()
        : null,
    },
    heartbeats: heartbeats.map((h) => ({
      source: h.source,
      state: h.state,
      reason: h.reason,
    })),
    // Domains that expire within 30 days, and this month's recorded payments (S81).
    domainsExpiring: expiringWithin(domains).map((d) => ({
      domain: d.domain,
      expiresAt: d.expiresAt!.toISOString(),
      daysLeft: d.daysLeft,
    })),
    expenses: expenses,
    reviews: reviews.map((k) => ({
      id: k.id,
      phrase: k.phrase,
      status: k.status,
      reviewAt: k.reviewAt!.toISOString(),
      due: k.reviewAt! <= now,
    })),
  });
});
