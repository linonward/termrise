"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { PoolKeywordDto } from "@repo/research/pool-dto";
import { Button } from "@repo/ui/components/button";

import { usePoolAction } from "./pool-action";

const field =
  "w-full rounded-md border border-border-strong bg-background px-3 py-2 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

// The maintainer's decisions and answers (docs/product/keyword-pool.md#statuses).
export function ReviewActions({ keyword }: { keyword: PoolKeywordDto }) {
  const t = useTranslations("pool.review");
  const { post, pending, error } = usePoolAction();
  const router = useRouter();
  const path = `/api/pool/keywords/${keyword.id}/review`;
  const [note, setNote] = useState("");
  const [h4, setH4] = useState<"" | "ok" | "no">("");
  const [h7, setH7] = useState<"" | "ok" | "no">("");
  const [h4Note, setH4Note] = useState(keyword.monetization ?? "");
  const [h7Note, setH7Note] = useState(keyword.compliance ?? "");
  const [angle, setAngle] = useState(keyword.aiAngle ?? "");
  const s = keyword.status;

  const answer = () =>
    post(path, {
      action: "answer",
      ...(h4 &&
        h4Note.trim() && {
          monetization: { ok: h4 === "ok", note: h4Note.trim() },
        }),
      ...(h7 &&
        h7Note.trim() && {
          compliance: { ok: h7 === "ok", note: h7Note.trim() },
        }),
      ...(angle.trim() && { aiAngle: angle.trim() }),
    });

  return (
    <section aria-labelledby="review-title" className="space-y-6">
      <h2 id="review-title" className="font-heading text-xl font-semibold">
        {t("title")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {s === "candidate" && (
          <Button
            disabled={pending}
            onClick={async () => {
              // Selecting starts the product: go there.
              const done = await post(path, { action: "select" });
              if (done?.productId) router.push(`/products/${done.productId}`);
            }}
          >
            {t("select")}
          </Button>
        )}
        {["excluded", "dropped", "failed"].includes(s) ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => post(path, { action: "restore" })}
          >
            {t("restore")}
          </Button>
        ) : (
          <>
            {s !== "dropped" && s !== "selected" && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  post(path, {
                    action: "drop",
                    ...(note.trim() && { note: note.trim() }),
                  })
                }
              >
                {t("drop")}
              </Button>
            )}
            {s !== "selected" && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  post(path, {
                    action: "exclude",
                    ...(note.trim() && { note: note.trim() }),
                  })
                }
              >
                {t("exclude")}
              </Button>
            )}
          </>
        )}
      </div>
      {!["excluded", "dropped", "failed", "selected"].includes(s) && (
        <label className="block space-y-2 text-[13px] font-medium">
          <span>{t("note")}</span>
          <input
            className={field}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void answer();
        }}
      >
        {(
          [
            ["h4", h4, setH4, h4Note, setH4Note],
            ["h7", h7, setH7, h7Note, setH7Note],
          ] as const
        ).map(([key, value, setValue, text, setText]) => (
          <fieldset key={key} className="space-y-2">
            <legend className="text-[13px] font-medium">
              {t(`${key}.question`)}
            </legend>
            <div className="flex gap-4 text-[15px]">
              {(["ok", "no"] as const).map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={key}
                    checked={value === v}
                    onChange={() => setValue(v)}
                    className="size-4.5 accent-primary"
                  />
                  {t(`${key}.${v}`)}
                </label>
              ))}
            </div>
            <input
              className={field}
              value={text}
              maxLength={500}
              placeholder={t(`${key}.placeholder`)}
              onChange={(e) => setText(e.target.value)}
            />
          </fieldset>
        ))}
        <label className="block space-y-2 text-[13px] font-medium">
          <span>{t("aiAngle")}</span>
          <input
            className={field}
            value={angle}
            maxLength={500}
            placeholder={t("aiAnglePlaceholder")}
            onChange={(e) => setAngle(e.target.value)}
          />
        </label>
        <Button type="submit" variant="outline" disabled={pending}>
          {t("save")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
