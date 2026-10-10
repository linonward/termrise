import { randomUUID } from "node:crypto";

import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ADJUST_LIMIT } from "@repo/admin/admin-rules";
import type { createAdminService } from "@repo/admin/admin-service";
import type { CreditPackId } from "@repo/billing/credit-packs";
import type { Task } from "@repo/tasks/task-service";

import { AdjustCreditsForm } from "@/components/admin/adjust-credits-form";
import { DataTable } from "@/components/admin/data-table";
import { PurchaseStatus } from "@/components/billing/purchase-status";
import { LocalDateTime } from "@/components/local-date-time";
import { formatUsd } from "@/lib/format-usd";
import { apiRequest, isAdmin } from "@/server/api/api";

// GET /api/admin/users/:id: the overview as JSON, dates as ISO strings. The paid
// records are Tasks in the starter (apps/api/src/product.ts).
type Overview = Jsonified<
  Omit<
    NonNullable<
      Awaited<
        ReturnType<ReturnType<typeof createAdminService>["getUserOverview"]>
      >
    >,
    "tasks"
  > & { tasks: Task[] }
>;
type Jsonified<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T;

export default async function AdminUserPage({
  params,
}: PageProps<"/admin/users/[id]">) {
  if (!(await isAdmin())) notFound();
  const { id } = await params;
  const response = await apiRequest(
    `/api/admin/users/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`API /api/admin/users failed: ${response.status}`);
  const overview = (await response.json()) as Overview;
  const t = await getTranslations("admin");
  const ts = await getTranslations("status");
  const tc = await getTranslations("admin.column");
  const tp = await getTranslations("pricing");
  const { user, ledgerSum } = overview;
  const balanced = user.creditBalance === ledgerSum;
  const col = (keys: Parameters<typeof tc>[0][]) => keys.map((k) => tc(k));
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <div className="space-y-4">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-[15px] font-medium"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <div className="space-y-2">
          <h1 className="font-heading text-[28px] font-bold tracking-tight break-all md:text-4xl">
            {user.email}
          </h1>
          <p className="text-[15px] break-all text-muted-foreground">
            {t("userId")}: {user.id} · {t("joined")}:{" "}
            <LocalDateTime iso={user.createdAt} />
          </p>
        </div>
      </div>
      <section className="flex flex-col gap-8 rounded-lg bg-surface px-6 py-6 md:flex-row md:justify-between md:px-8">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
              {t("credits")}
            </h2>
            <p
              data-testid="admin-balance"
              className="font-heading text-4xl font-bold tabular-nums"
            >
              {user.creditBalance}
            </p>
          </div>
          <p
            data-testid="ledger-check"
            role={balanced ? undefined : "alert"}
            className={
              balanced
                ? "flex items-center gap-2 text-[13px] text-muted-foreground"
                : "flex gap-3 rounded-md bg-destructive-soft p-4 text-sm font-semibold"
            }
          >
            {balanced ? (
              <CircleCheck aria-hidden="true" className="size-4 text-success" />
            ) : (
              <CircleAlert
                aria-hidden="true"
                className="size-4.5 shrink-0 text-destructive"
              />
            )}
            {balanced
              ? t("ledgerOk")
              : t("ledgerMismatch", {
                  balance: user.creditBalance,
                  sum: ledgerSum,
                })}
          </p>
        </div>
        <AdjustCreditsForm
          userId={user.id}
          adjustmentId={randomUUID()}
          limit={ADJUST_LIMIT}
        />
      </section>
      <section className="space-y-4">
        <h2 className="font-heading text-2xl font-semibold">
          {t("transactions")}
        </h2>
        <DataTable
          testId="transaction-row"
          empty={t("empty")}
          columns={col(["date", "type", "amount", "balanceAfter", "note"])}
          rows={overview.transactions.map((x) => ({
            key: x.id,
            cells: [
              <LocalDateTime key="d" iso={x.createdAt} />,
              t(`transactionType.${x.type}`),
              <span key="a" className="tabular-nums">
                {x.amount > 0 ? `+${x.amount}` : x.amount}
              </span>,
              <span key="b" className="tabular-nums">
                {x.balanceAfter}
              </span>,
              x.description ?? "",
            ],
          }))}
        />
      </section>
      <section className="space-y-4">
        <h2 className="font-heading text-2xl font-semibold">{t("tasks")}</h2>
        <DataTable
          testId="task-row"
          empty={t("empty")}
          columns={col(["date", "status", "cost", "error"])}
          rows={overview.tasks.map((task) => ({
            key: task.id,
            cells: [
              <LocalDateTime key="d" iso={task.createdAt} />,
              ts(task.status),
              <span key="c" className="tabular-nums">
                {task.creditsCost}
              </span>,
              task.errorCode ?? "",
            ],
          }))}
        />
      </section>
      <section className="space-y-4">
        <h2 className="font-heading text-2xl font-semibold">
          {t("purchases")}
        </h2>
        <DataTable
          testId="admin-purchase-row"
          empty={t("empty")}
          columns={col([
            "date",
            "pack",
            "price",
            "credits",
            "status",
            "orderId",
          ])}
          rows={overview.purchases.map((p) => ({
            key: p.id,
            cells: [
              <LocalDateTime key="d" iso={p.createdAt} />,
              tp(`pack.${p.packId as CreditPackId}`),
              <span key="p" className="tabular-nums">
                {formatUsd(p.amountUsd, { cents: true })}
              </span>,
              <span key="c" className="tabular-nums">
                {p.credits}
              </span>,
              <PurchaseStatus key="s" status={p.status} />,
              p.providerOrderId ?? "",
            ],
          }))}
        />
      </section>
    </main>
  );
}
