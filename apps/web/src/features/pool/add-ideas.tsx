"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { usePoolAction } from "./pool-action";

// The maintainer's own ideas: one keyword per line, checked by the next round.
export function AddIdeas() {
  const t = useTranslations("pool");
  const { post, pending, error } = usePoolAction();
  const [text, setText] = useState("");
  const [result, setResult] = useState<string>();

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const phrases = text
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);
        if (phrases.length === 0) return;
        const done = await post("/api/pool/keywords", { phrases });
        if (done) {
          setText("");
          setResult(
            t("addDone", {
              added: done.added.length,
              existing: done.existing.length,
            }),
          );
        }
      }}
    >
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("addLabel")}</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-border-strong bg-background px-3 py-2 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        className="h-10 px-4"
        disabled={pending}
      >
        {t("addButton")}
      </Button>
      {result && <p className="text-[13px] text-muted-foreground">{result}</p>}
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
