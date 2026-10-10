"use client";
import { Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { track } from "@repo/analytics/client";
import type { TaskDto } from "@repo/tasks/task-dto";
import { Button } from "@repo/ui/components/button";

import { RelativeTime } from "@/components/relative-time";
import { errorCodeOf, type ApiErrorCode } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

// Example paid action (docs/architecture/tasks.md): replace the form and the
// result list with the product's own feature.
export function TaskPanel({
  initialTasks,
  maxLength,
}: {
  initialTasks: TaskDto[];
  maxLength: number;
}) {
  const t = useTranslations("tasks");
  const tErrors = useTranslations("errors");
  const tStatus = useTranslations("status");
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiErrorCode>();

  async function run(form: HTMLFormElement) {
    const input = String(new FormData(form).get("input") ?? "");
    setPending(true);
    setError(undefined);
    track("task_started", { inputLength: input.length });
    const response = await apiFetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID(), input }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      const code = errorCodeOf(response ?? null, body);
      if (code === "INSUFFICIENT_CREDITS") track("credits_exhausted");
      setError(code);
      return;
    }
    const task = body as TaskDto;
    setTasks((current) => [task, ...current.filter((x) => x.id !== task.id)]);
    if (task.status === "SUCCEEDED") form.reset();
    // The balance in the nav and the credits card comes from the server.
    router.refresh();
  }

  return (
    <section className="space-y-6" aria-labelledby="task-title">
      <div className="space-y-2">
        <h2
          id="task-title"
          className="font-heading text-xl font-semibold tracking-tight md:text-2xl"
        >
          {t("title")}
        </h2>
        <p className="text-[15px] text-muted-foreground">{t("body")}</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(event.currentTarget);
        }}
      >
        <label className="block space-y-2 text-[13px] font-medium">
          <span>{t("input")}</span>
          <textarea
            name="input"
            required
            maxLength={maxLength}
            rows={3}
            disabled={pending}
            className="w-full rounded-md border border-border-strong bg-background px-4 py-3 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          />
        </label>
        <Button type="submit" className="h-12 px-6" disabled={pending}>
          <Play aria-hidden="true" />
          {pending ? t("running") : t("run")}
        </Button>
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {tErrors(error)}{" "}
            {error === "INSUFFICIENT_CREDITS" && (
              <Link
                href="/billing"
                className="font-medium underline underline-offset-4"
              >
                {t("buyCredits")}
              </Link>
            )}
          </p>
        )}
      </form>
      {tasks.length === 0 ? (
        <div className="space-y-1 rounded-lg border border-border p-6">
          <p className="text-[15px] font-medium">{t("empty")}</p>
          <p className="text-[15px] text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tasks.map((task) => (
            <li key={task.id} className="space-y-1 px-6 py-4">
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {tStatus(task.status)}
                </span>
                <RelativeTime iso={task.createdAt} />
              </p>
              <p className="text-[15px] break-words">
                {task.status === "SUCCEEDED"
                  ? task.output
                  : task.status === "FAILED"
                    ? t("failed")
                    : task.input}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
