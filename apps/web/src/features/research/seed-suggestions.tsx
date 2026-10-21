"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { SeedSuggestionDto } from "@repo/research/research-dto";
import { seedsFromText } from "@repo/research/research-rules";
import { Button } from "@repo/ui/components/button";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

import { RunPoller } from "./run-poller";

const SUGGESTION_ERRORS = [
  "PROVIDER_ERROR",
  "PROVIDER_AUTH_FAILED",
  "BUDGET_EXHAUSTED",
  "MONTHLY_BUDGET_EXHAUSTED",
  "INVALID_AI_OUTPUT",
  "SUGGESTION_TIMED_OUT",
] as const;

// Suggests short search phrases for long seeds, such as a story title; the user edits
// them and saves them as the seeds (docs/product/ux.md#research).
export function SeedSuggestions({
  projectId,
  suggestion,
}: {
  projectId: string;
  suggestion: SeedSuggestionDto | null;
}) {
  const t = useTranslations("research");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function send(path: string, method: string, body: unknown) {
    setPending(true);
    setError(undefined);
    const response = await apiFetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(tErrors(errorCodeOf(response ?? null, json)));
      return;
    }
    router.refresh();
  }

  const base = `/api/research/projects/${projectId}`;
  const suggest = () =>
    send(`${base}/seed-suggestions`, "POST", {
      requestId: crypto.randomUUID(),
    });
  const inProgress =
    suggestion?.status === "pending" || suggestion?.status === "running";
  const failed = suggestion?.status === "failed" ? suggestion : null;
  const phrases =
    suggestion?.status === "completed" ? (suggestion.phrases ?? []) : null;

  return (
    <section
      aria-labelledby="seed-suggestions-title"
      className="space-y-3"
      data-testid="seed-suggestions"
    >
      <h2
        id="seed-suggestions-title"
        className="font-heading text-xl font-semibold"
      >
        {t("suggestTitle")}
      </h2>
      <p className="text-[15px] text-muted-foreground">{t("suggestBody")}</p>
      {inProgress && (
        <>
          <p role="status" className="text-[15px]">
            {t("suggesting")}
          </p>
          <RunPoller />
        </>
      )}
      {failed && (
        <p role="alert" className="text-[13px] text-destructive">
          {SUGGESTION_ERRORS.includes(
            failed.errorCode as (typeof SUGGESTION_ERRORS)[number],
          )
            ? t(
                `suggestError.${failed.errorCode as (typeof SUGGESTION_ERRORS)[number]}`,
              )
            : t("suggestError.INTERNAL_ERROR")}
        </p>
      )}
      {phrases && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const text = new FormData(event.currentTarget).get("phrases");
            void send(base, "PATCH", { seeds: seedsFromText(String(text)) });
          }}
        >
          <label className="block space-y-2 text-[13px] font-medium">
            <span>{t("suggestPhrases")}</span>
            <textarea
              name="phrases"
              required
              rows={Math.min(Math.max(phrases.length, 3), 8)}
              defaultValue={phrases.join("\n")}
              className="w-full rounded-md border border-border-strong bg-background px-4 py-3 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            />
            {suggestion?.provider === "fake" && (
              <span className="block font-normal text-muted-foreground">
                {t("suggestFake")}
              </span>
            )}
          </label>
          <Button type="submit" className="h-10 px-4" disabled={pending}>
            {t("suggestUse")}
          </Button>
        </form>
      )}
      {!inProgress && (
        <Button
          variant={phrases ? "outline" : "default"}
          className="h-10 px-4"
          disabled={pending}
          onClick={suggest}
        >
          {phrases || failed ? t("suggestAgain") : t("suggestButton")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
