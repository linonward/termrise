import { Coins } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import type { ResearchProjectDto } from "@repo/research/research-dto";
import {
  TASK_CREDIT_COST,
  TASK_INPUT_MAX_LENGTH,
} from "@repo/tasks/credit-cost";
import type { TaskDto } from "@repo/tasks/task-dto";
import { Button } from "@repo/ui/components/button";

import { TrackView } from "@/components/analytics/track";
import { ResearchStatus } from "@/features/research/research-status";
import { TaskPanel } from "@/features/tasks/task-panel";
import { apiGet, getBalance } from "@/server/api/api";
import { getRequestSession } from "@/server/auth/auth";
import product from "@product";

export default async function DashboardPage() {
  const session = await getRequestSession();
  if (!session) redirect("/sign-in?next=%2Fdashboard");
  const t = await getTranslations("dashboard");
  const { name, email } = session.user;
  const title =
    name && name !== email ? t("welcome", { name }) : t("welcomeBack");
  // Early access: no credits, so the example paid action is hidden; the dashboard lists
  // the newest research projects instead (docs/product/ux.md#dashboard).
  if (!product.billingEnabled) {
    const { items } = await apiGet<{ items: ResearchProjectDto[] }>(
      "/api/research/projects",
    );
    const projects = items.slice(0, 5);
    return (
      <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:px-5 md:py-16">
        <TrackView event="dashboard_viewed" />
        <header className="space-y-2">
          <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
            {title}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {t("earlyAccessSubtitle")}
          </p>
        </header>
        <section aria-labelledby="research-title" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2
              id="research-title"
              className="font-heading text-xl font-semibold tracking-tight md:text-2xl"
            >
              {t("researchTitle")}
            </h2>
            {projects.length > 0 && (
              <Link
                href="/research"
                className="text-[15px] font-medium underline underline-offset-4"
              >
                {t("researchAll")}
              </Link>
            )}
          </div>
          {projects.length === 0 ? (
            <div className="space-y-4 rounded-lg border border-border p-6">
              <p className="text-[15px] text-muted-foreground">
                {t("researchEmpty")}
              </p>
              <Button asChild className="h-10 px-4">
                <Link href="/research">{t("researchCta")}</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <Link
                    href={`/research/${project.id}`}
                    className="min-w-0 truncate text-[15px] font-medium hover:underline hover:underline-offset-4"
                  >
                    {project.name}
                  </Link>
                  <ResearchStatus status={project.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    );
  }
  // getBalance refunds stale tasks first, so the list below shows them as failed.
  const balance = await getBalance();
  const { items: recent } = await apiGet<{ items: TaskDto[] }>(
    "/api/tasks?limit=6",
  );
  const uses = Math.floor(balance / TASK_CREDIT_COST);
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:px-5 md:py-16">
      <TrackView event="dashboard_viewed" />
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
          {title}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      <section
        aria-labelledby="credits-label"
        className="flex flex-col gap-6 rounded-lg bg-surface px-6 py-6 md:flex-row md:items-center md:gap-8 md:px-8"
      >
        <div className="space-y-1">
          <h2
            id="credits-label"
            className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase"
          >
            {t("credits")}
          </h2>
          <p className="flex items-baseline gap-2">
            <span
              className="font-heading text-4xl font-bold tabular-nums"
              data-testid="credit-balance"
            >
              {balance}
            </span>
            <span className="text-[15px] text-muted-foreground">
              {t("available")}
            </span>
          </p>
        </div>
        <div className="space-y-1 md:border-l md:border-border md:pl-8">
          <p className="text-[15px] font-medium">{t("estimate", { uses })}</p>
          <p className="text-[13px] text-muted-foreground">{t("refundNote")}</p>
        </div>
        <Button asChild variant="outline" className="h-10 px-4 md:ml-auto">
          <Link href="/billing">
            <Coins aria-hidden="true" />
            {t("buyCredits")}
          </Link>
        </Button>
      </section>
      <TaskPanel initialTasks={recent} maxLength={TASK_INPUT_MAX_LENGTH} />
    </main>
  );
}
