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
export function Reasons({ reasons }: { reasons: unknown }) {
  const t = useTranslations("pool.reason");
  const list = (Array.isArray(reasons) ? reasons : []) as Reason[];
  if (list.length === 0) return null;
  return (
    <ul className="space-y-1 text-[13px] text-muted-foreground">
      {list.map((r, i) => {
        const { key, values } = reasonMessage(r);
        // Keys come from reasonMessage(); pool-format.test.ts covers them.
        return <li key={i}>{t(key as Parameters<typeof t>[0], values)}</li>;
      })}
    </ul>
  );
}
