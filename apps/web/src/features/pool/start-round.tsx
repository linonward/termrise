"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { usePoolAction } from "./pool-action";

const input =
  "h-10 w-full rounded-md border border-border-strong bg-background px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

// Queues a manual round; the worker runs it within a minute (docs/product/keyword-pool.md#rounds).
export function StartRound({ open }: { open: boolean }) {
  const t = useTranslations("pool");
  const { post, pending, error } = usePoolAction();
  const [source, setSource] = useState("");

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void post(
          "/api/pool/rounds",
          source.trim() ? { source: source.trim() } : {},
        );
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">{t("roundSource")}</span>
          <input
            className={input}
            value={source}
            maxLength={70}
            placeholder={t("roundSourcePlaceholder")}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <Button type="submit" className="h-10 px-4" disabled={pending || open}>
          {open
            ? t("roundOpen")
            : pending
              ? t("roundStarting")
              : t("roundStart")}
        </Button>
      </div>
      <p className="text-[13px] text-muted-foreground">{t("roundHelp")}</p>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
