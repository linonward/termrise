"use client";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { EmptyState } from "@/components/empty-state";
import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

export const EXPENSE_CATEGORIES = [
  "domain",
  "hosting",
  "data",
  "ai",
  "tool",
  "other",
] as const;

export type ExpenseItem = {
  id: string;
  paidOn: string;
  amountMinor: number;
  currency: string;
  category: (typeof EXPENSE_CATEGORIES)[number];
  note: string;
  domain: string | null;
};

const field =
  "h-10 w-full rounded-md border border-border-strong bg-background px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

// Record and remove payments (docs/product/ux.md#expenses). Amounts are typed in the
// currency's main unit and stored in minor units.
export function Expenses({
  items,
  today,
}: {
  items: ExpenseItem[];
  today: string;
}) {
  const t = useTranslations("expenses");
  const tErrors = useTranslations("errors");
  const format = useFormatter();
  const router = useRouter();
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState<ExpenseItem["category"]>("domain");
  const [note, setNote] = useState("");
  const [domain, setDomain] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function send(path: string, init: RequestInit) {
    setPending(true);
    setError(undefined);
    const response = await apiFetch(path, init).catch(() => null);
    const json =
      response?.status === 204
        ? null
        : await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(tErrors(errorCodeOf(response ?? null, json)));
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-8">
      <form
        className="grid gap-4 rounded-lg bg-surface px-6 py-6 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const value = Number(amount);
          if (!Number.isFinite(value) || value <= 0) return;
          const ok = await send("/api/expenses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              paidOn,
              amountMinor: Math.round(value * 100),
              currency,
              category,
              note,
              ...(domain.trim() ? { domain } : {}),
            }),
          });
          if (ok) {
            setAmount("");
            setNote("");
            setDomain("");
          }
        }}
      >
        <label className="space-y-2 text-[13px] font-medium">
          <span>{t("paidOn")}</span>
          <input
            type="date"
            required
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className={field}
          />
        </label>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <label className="space-y-2 text-[13px] font-medium">
            <span>{t("amount")}</span>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={field}
            />
          </label>
          <label className="space-y-2 text-[13px] font-medium">
            <span>{t("currency")}</span>
            <input
              required
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${field} uppercase`}
            />
          </label>
        </div>
        <label className="space-y-2 text-[13px] font-medium">
          <span>{t("category")}</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as ExpenseItem["category"])
            }
            className={field}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-[13px] font-medium">
          <span>{t("note")}</span>
          <input
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
            className={field}
          />
        </label>
        <label className="space-y-2 text-[13px] font-medium">
          <span>{t("domain")}</span>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className={field}
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="h-10 px-4" disabled={pending}>
            {t("add")}
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="text-[13px] text-destructive sm:col-span-2"
          >
            {error}
          </p>
        )}
      </form>

      {items.length === 0 ? (
        <EmptyState title={t("emptyTitle")} body={t("emptyText")} />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium">{t("paidOn")}</th>
                <th className="py-2 pr-4 font-medium">{t("category")}</th>
                <th className="py-2 pr-4 font-medium">{t("note")}</th>
                <th className="py-2 pr-4 text-right font-medium">
                  {t("amount")}
                </th>
                <th className="py-2 font-medium">
                  <span className="sr-only">{t("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border"
                  data-testid="expense-row"
                >
                  <td className="py-3 pr-4 whitespace-nowrap tabular-nums">
                    {item.paidOn}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {t(`categories.${item.category}`)}
                  </td>
                  <td className="py-3 pr-4 text-[15px]">
                    {[item.note, item.domain].filter(Boolean).join(" · ")}
                  </td>
                  <td className="py-3 pr-4 text-right whitespace-nowrap tabular-nums">
                    {format.number(item.amountMinor / 100, {
                      style: "currency",
                      currency: item.currency,
                    })}
                  </td>
                  <td className="py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-3"
                      disabled={pending}
                      onClick={() =>
                        void send(`/api/expenses/${item.id}`, {
                          method: "DELETE",
                        })
                      }
                    >
                      {t("remove")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
