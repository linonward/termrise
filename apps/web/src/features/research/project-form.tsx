"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { ResearchProjectDto } from "@repo/research/research-dto";
import {
  DEFAULT_AI_BUDGET_USD,
  DEFAULT_DATA_BUDGET_USD,
  MAX_BUDGET_USD,
  MAX_SEEDS,
  PROJECT_NAME_MAX_LENGTH,
  seedsFromText,
} from "@repo/research/research-rules";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/utils";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

const FIELD =
  "w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-50";

// Creates a research project, or edits a draft (docs/product/ux.md#research).
export function ProjectForm({
  project,
  showMarket,
}: {
  project?: ResearchProjectDto;
  showMarket?: boolean;
}) {
  const t = useTranslations("research");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const locked = project !== undefined && project.status !== "draft";

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setPending(true);
    setError(undefined);
    setSaved(false);
    const body = {
      name: String(data.get("name") ?? ""),
      seeds: seedsFromText(String(data.get("seeds") ?? "")),
      dataBudgetUsd: Number(data.get("dataBudgetUsd")),
      aiBudgetUsd: Number(data.get("aiBudgetUsd")),
    };
    const response = await apiFetch(
      project
        ? `/api/research/projects/${project.id}`
        : "/api/research/projects",
      {
        method: project ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ).catch(() => null);
    const json = await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(tErrors(errorCodeOf(response ?? null, json)));
      return;
    }
    if (project) {
      setSaved(true);
      router.refresh();
    } else router.push(`/research/${(json as ResearchProjectDto).id}`);
  }

  const disabled = pending || locked;
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("name")}</span>
        <input
          name="name"
          required
          maxLength={PROJECT_NAME_MAX_LENGTH}
          defaultValue={project?.name}
          disabled={disabled}
          className={cn(FIELD, "h-11")}
        />
      </label>
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("seeds")}</span>
        <textarea
          name="seeds"
          required
          rows={5}
          defaultValue={project?.seeds.join("\n")}
          disabled={disabled}
          className={cn(FIELD, "py-3")}
        />
        <span className="block font-normal text-muted-foreground">
          {t("seedsHint", { max: MAX_SEEDS })}
        </span>
      </label>
      {showMarket && (
        <div className="space-y-1">
          <p className="text-[13px] font-medium">{t("market")}</p>
          <p className="text-[15px] text-muted-foreground">
            {t("marketValue")}
          </p>
        </div>
      )}
      <div className="flex gap-4">
        {(
          [
            [
              "dataBudgetUsd",
              "dataBudget",
              project?.dataBudgetUsd ?? DEFAULT_DATA_BUDGET_USD,
            ],
            [
              "aiBudgetUsd",
              "aiBudget",
              project?.aiBudgetUsd ?? DEFAULT_AI_BUDGET_USD,
            ],
          ] as const
        ).map(([name, label, value]) => (
          <label
            key={name}
            className="block flex-1 space-y-2 text-[13px] font-medium"
          >
            <span>{t(label)}</span>
            <input
              name={name}
              type="number"
              required
              min={0}
              max={MAX_BUDGET_USD}
              step={0.01}
              defaultValue={value}
              disabled={disabled}
              className={cn(FIELD, "h-11")}
            />
          </label>
        ))}
      </div>
      {!locked && (
        <Button
          type="submit"
          disabled={pending}
          className={cn("h-10 px-4", !project && "w-full")}
        >
          {project
            ? pending
              ? t("saving")
              : t("save")
            : pending
              ? t("creating")
              : t("create")}
        </Button>
      )}
      {saved && (
        <p role="status" className="text-[13px] text-success">
          {t("saved")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
