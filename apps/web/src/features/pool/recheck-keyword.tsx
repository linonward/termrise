"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { usePoolAction } from "./pool-action";

// Queues a round that measures this one keyword again with Termrise's own data
// (docs/product/keyword-pool.md#rounds); an open round must finish first.
export function RecheckKeyword({ id, phrase }: { id: string; phrase: string }) {
  const t = useTranslations("pool");
  const { post, pending, error } = usePoolAction();
  const [queued, setQueued] = useState<{ id: string; ours: boolean }>();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="h-10 px-4"
        disabled={pending || queued?.ours}
        onClick={async () => {
          const round = (await post(
            `/api/pool/keywords/${id}/recheck`,
            {},
          )) as {
            id: string;
            source: string | null;
          } | null;
          if (round)
            setQueued({
              id: round.id,
              ours: round.source === `recheck:${phrase}`,
            });
        }}
      >
        {pending ? t("roundStarting") : t("recheckOne.button")}
      </Button>
      {queued && (
        <p role="status" className="text-[13px] text-muted-foreground">
          {queued.ours ? t("recheckOne.queued") : t("recheckOne.busy")}{" "}
          <Link
            href={`/keywords/rounds/${queued.id}`}
            className="underline underline-offset-4"
          >
            {t("recheckOne.round")}
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
