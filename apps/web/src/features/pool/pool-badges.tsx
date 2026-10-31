import { useTranslations } from "next-intl";

import type { PoolKeywordDto, PoolRoundDto } from "@repo/research/pool-dto";
import type { Reason } from "@repo/research/pool-rules";

import { StatusBadge } from "@/components/status-badge";
import { poolBadge, poolRoundBadge } from "@/lib/status-badges";

import { reasonMessage } from "./pool-format";

export function PoolStatusBadge({
  status,
}: {
  status: PoolKeywordDto["status"];
}) {
  const t = useTranslations("pool.status");
  return (
    <StatusBadge badge={poolBadge(status)} data-testid="pool-status">
      {t(status)}
    </StatusBadge>
  );
}

export function RoundStatusBadge({
  status,
}: {
  status: PoolRoundDto["status"];
}) {
  const t = useTranslations("pool.roundStatus");
  return <StatusBadge badge={poolRoundBadge(status)}>{t(status)}</StatusBadge>;
}

/** Why a keyword has its status, one line per reason. */
export function Reasons({
  reasons,
  compact = false,
}: {
  reasons: unknown;
  /** Lists: the first reason on one line; the detail page shows them all. */
  compact?: boolean;
}) {
  const t = useTranslations("pool.reason");
  // keyword-lab's own words are not shown: its numbers are measured again (S72).
  const all = ((Array.isArray(reasons) ? reasons : []) as Reason[]).filter(
    (r) => r.rule !== "imported",
  );
  const list = compact ? all.slice(0, 1) : all;
  if (list.length === 0) return null;
  return (
    <ul className="space-y-1 text-[13px] text-muted-foreground">
      {list.map((r, i) => {
        const { key, values } = reasonMessage(r);
        // Keys come from reasonMessage(); pool-format.test.ts covers them.
        const text = t(key as Parameters<typeof t>[0], values);
        return (
          <li
            key={i}
            className={compact ? "line-clamp-1" : undefined}
            title={compact ? text : undefined}
          >
            {text}
          </li>
        );
      })}
    </ul>
  );
}
