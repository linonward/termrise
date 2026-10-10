"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  MAX_CSV_LENGTH,
  MAX_CSV_ROWS,
  type CsvProblem,
  type RejectReason,
} from "@repo/research/research-rules";
import { Button } from "@repo/ui/components/button";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

type ImportResult = {
  imported: number;
  duplicates: number;
  rejectedCount: number;
  rejected: { line: number; reason: RejectReason }[];
  seedsAdded: number;
  seedsSkipped: number;
};

// Reads the CSV in the browser and sends its text; apps/api validates it row by row.
export function ImportCsv({ projectId }: { projectId: string }) {
  const t = useTranslations("research");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const [error, setError] = useState<string>();

  async function submit(form: HTMLFormElement) {
    const file = new FormData(form).get("file");
    setResult(undefined);
    setError(undefined);
    if (!(file instanceof File)) return;
    // A character is at most 4 bytes: a bigger file cannot fit MAX_CSV_LENGTH characters.
    if (file.size > MAX_CSV_LENGTH * 4) {
      setError(t("importProblem.too_large"));
      return;
    }
    setPending(true);
    const csv = await file.text().catch(() => null);
    if (csv === null) {
      setPending(false);
      setError(t("importProblem.unreadable"));
      return;
    }
    const response = await apiFetch(
      `/api/research/projects/${projectId}/import`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      },
    ).catch(() => null);
    const body = await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      const problem = body?.error?.reason as CsvProblem | undefined;
      setError(
        problem
          ? t(`importProblem.${problem}`)
          : tErrors(errorCodeOf(response ?? null, body)),
      );
      return;
    }
    setResult(body as ImportResult);
    form.reset();
    router.refresh();
  }

  return (
    <form
      aria-labelledby="import-title"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <h3 id="import-title" className="font-heading text-xl font-semibold">
        {t("importTitle")}
      </h3>
      <p className="text-[13px] text-muted-foreground">
        {t("importHint", { rows: MAX_CSV_ROWS })}
      </p>
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("importFile")}</span>
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          disabled={pending}
          className="block w-full text-[15px] file:mr-4 file:h-10 file:rounded-md file:border file:border-border-strong file:bg-background file:px-4 file:text-[15px] file:font-medium"
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="h-10 px-4"
      >
        {pending ? t("importing") : t("importButton")}
      </Button>
      {result && (
        <div role="status" className="space-y-1 text-[13px]">
          <p className="font-medium">
            {t("importResult", {
              imported: result.imported,
              duplicates: result.duplicates,
              rejected: result.rejectedCount,
              seeds: result.seedsAdded,
            })}
          </p>
          {result.seedsSkipped > 0 && (
            <p className="text-muted-foreground">
              {t("importSeedsFull", { count: result.seedsSkipped })}
            </p>
          )}
          {result.rejected.length > 0 && (
            <ul className="text-muted-foreground">
              {result.rejected.map(({ line, reason }) => (
                <li key={line}>
                  {t("importRejectedLine", {
                    line,
                    reason: t(`rejectReason.${reason}`),
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
