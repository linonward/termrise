import { Coins } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@repo/ui/components/button";

import { TrackView } from "@/components/analytics/track";
import { TASK_CREDIT_COST } from "@/features/tasks/credit-cost";
import { TaskPanel } from "@/features/tasks/task-panel";
import { TASK_INPUT_MAX_LENGTH } from "@/features/tasks/task-service";
import { getTaskService, toTaskDto } from "@/features/tasks/tasks";
import { getRequestSession } from "@/server/auth/auth";
import { balanceForUser } from "@/server/credits/credits";

export default async function DashboardPage() {
  const session = await getRequestSession();
  if (!session) redirect("/sign-in?next=%2Fdashboard");
  const t = await getTranslations("dashboard");
  const { id, name, email } = session.user;
  // balanceForUser refunds stale tasks first, so the list below shows them as failed.
  const balance = await balanceForUser(id);
  const recent = await getTaskService().list(id, 6);
  const uses = Math.floor(balance / TASK_CREDIT_COST);
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:px-5 md:py-16">
      <TrackView event="dashboard_viewed" />
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
          {name && name !== email ? t("welcome", { name }) : t("welcomeBack")}
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
      <TaskPanel
        initialTasks={recent.map(toTaskDto)}
        maxLength={TASK_INPUT_MAX_LENGTH}
      />
    </main>
  );
}
