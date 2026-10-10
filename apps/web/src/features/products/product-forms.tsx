"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { ExecutionProjectDto } from "@repo/execution/execution-dto";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/utils";

import { useSubmit } from "./use-submit";

const FIELD =
  "w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-50";
const LABEL = "block space-y-2 text-[13px] font-medium";
const STATUSES = [
  "not_started",
  "validating",
  "building",
  "launched",
  "measuring",
  "archived",
] as const;

function Alert({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="text-[13px] text-destructive">
      {error}
    </p>
  ) : null;
}

const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;

/** Starts the product of a Go opportunity and opens it. */
export function StartProduct({ opportunityId }: { opportunityId: string }) {
  const t = useTranslations("products");
  const router = useRouter();
  const { send, pending, error } = useSubmit();
  return (
    <div className="space-y-2">
      <Button
        className="h-10 px-4"
        disabled={pending}
        onClick={async () => {
          const product = (await send("/api/execution/projects", "POST", {
            opportunityId,
          })) as ExecutionProjectDto | null;
          if (product) router.push(`/projects/${product.id}`);
        }}
      >
        {pending ? t("starting") : t("start")}
      </Button>
      <Alert error={error} />
    </div>
  );
}

export function ProductForm({ product }: { product: ExecutionProjectDto }) {
  const t = useTranslations("products");
  const { send, pending, error } = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void send(`/api/execution/projects/${product.id}`, "PATCH", {
          name: text(data, "name"),
          status: data.get("status"),
          launchedOn: optional(data, "launchedOn"),
          domain: optional(data, "domain"),
          repoUrl: optional(data, "repoUrl"),
        });
      }}
    >
      <label className={LABEL}>
        <span>{t("field.name")}</span>
        <input
          name="name"
          required
          maxLength={100}
          defaultValue={product.name}
          className={cn(FIELD, "h-11")}
        />
      </label>
      <div className="flex flex-col gap-4 md:flex-row">
        <label className={cn(LABEL, "flex-1")}>
          <span>{t("field.status")}</span>
          <select
            name="status"
            defaultValue={product.status}
            className={cn(FIELD, "h-11")}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={cn(LABEL, "flex-1")}>
          <span>{t("field.launchedOn")}</span>
          <input
            name="launchedOn"
            type="date"
            defaultValue={product.launchedOn ?? ""}
            className={cn(FIELD, "h-11")}
          />
        </label>
      </div>
      <label className={LABEL}>
        <span>{t("field.domain")}</span>
        <input
          name="domain"
          placeholder="example.com"
          defaultValue={product.domain ?? ""}
          className={cn(FIELD, "h-11")}
        />
      </label>
      <label className={LABEL}>
        <span>{t("field.repoUrl")}</span>
        <input
          name="repoUrl"
          type="url"
          placeholder="https://github.com/…"
          defaultValue={product.repoUrl ?? ""}
          className={cn(FIELD, "h-11")}
        />
      </label>
      <Button type="submit" className="h-10 px-4" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
      <Alert error={error} />
    </form>
  );
}

export function EventForm({ productId }: { productId: string }) {
  const t = useTranslations("products");
  const { send, pending, error } = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const ok = await send(
          `/api/execution/projects/${productId}/events`,
          "POST",
          {
            metric: data.get("metric"),
            count: Number(data.get("count")),
            periodStart: text(data, "periodStart"),
            periodEnd: text(data, "periodEnd"),
            ...(text(data, "note") ? { note: text(data, "note") } : {}),
          },
        );
        if (ok) form.reset();
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row">
        <label className={cn(LABEL, "flex-1")}>
          <span>{t("field.metric")}</span>
          <select name="metric" className={cn(FIELD, "h-11")}>
            <option value="visitors">{t("metric.visitors")}</option>
            <option value="activations">{t("metric.activations")}</option>
          </select>
        </label>
        <label className={cn(LABEL, "flex-1")}>
          <span>{t("field.count")}</span>
          <input
            name="count"
            type="number"
            required
            min={0}
            step={1}
            className={cn(FIELD, "h-11")}
          />
        </label>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        <label className={cn(LABEL, "flex-1")}>
          <span>{t("field.periodStart")}</span>
          <input
            name="periodStart"
            type="date"
            required
            className={cn(FIELD, "h-11")}
          />
        </label>
        <label className={cn(LABEL, "flex-1")}>
          <span>{t("field.periodEnd")}</span>
          <input
            name="periodEnd"
            type="date"
            required
            className={cn(FIELD, "h-11")}
          />
        </label>
      </div>
      <label className={LABEL}>
        <span>{t("field.note")}</span>
        <input name="note" maxLength={500} className={cn(FIELD, "h-11")} />
      </label>
      <Button type="submit" className="h-10 px-4" disabled={pending}>
        {pending ? t("saving") : t("addEvent")}
      </Button>
      <Alert error={error} />
    </form>
  );
}

export function RevenueForm({ productId }: { productId: string }) {
  const t = useTranslations("products");
  const { send, pending, error } = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const fees = text(data, "fees");
        const ok = await send(
          `/api/execution/projects/${productId}/revenue`,
          "POST",
          {
            occurredOn: text(data, "occurredOn"),
            currency: text(data, "currency").toUpperCase(),
            orders: Number(data.get("orders")),
            gross: Number(data.get("gross")),
            refund: Number(data.get("refund") || 0),
            fees: fees === "" ? null : Number(fees),
            ...(text(data, "evidence")
              ? { evidence: text(data, "evidence") }
              : {}),
            ...(text(data, "note") ? { note: text(data, "note") } : {}),
          },
        );
        if (ok) form.reset();
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row">
        <label className={cn(LABEL, "flex-1")}>
          <span>{t("field.occurredOn")}</span>
          <input
            name="occurredOn"
            type="date"
            required
            className={cn(FIELD, "h-11")}
          />
        </label>
        <label className={cn(LABEL, "md:w-28")}>
          <span>{t("field.currency")}</span>
          <input
            name="currency"
            required
            defaultValue="USD"
            pattern="[A-Za-z]{3}"
            maxLength={3}
            className={cn(FIELD, "h-11 uppercase")}
          />
        </label>
        <label className={cn(LABEL, "md:w-28")}>
          <span>{t("field.orders")}</span>
          <input
            name="orders"
            type="number"
            required
            min={0}
            step={1}
            className={cn(FIELD, "h-11")}
          />
        </label>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        {(["gross", "refund", "fees"] as const).map((key) => (
          <label key={key} className={cn(LABEL, "flex-1")}>
            <span>{t(`field.${key}`)}</span>
            <input
              name={key}
              type="number"
              required={key === "gross"}
              min={0}
              step={0.01}
              className={cn(FIELD, "h-11")}
            />
          </label>
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground">{t("feesHint")}</p>
      <label className={LABEL}>
        <span>{t("field.evidence")}</span>
        <input
          name="evidence"
          maxLength={300}
          placeholder={t("evidenceHint")}
          className={cn(FIELD, "h-11")}
        />
      </label>
      <label className={LABEL}>
        <span>{t("field.note")}</span>
        <input name="note" maxLength={500} className={cn(FIELD, "h-11")} />
      </label>
      <Button type="submit" className="h-10 px-4" disabled={pending}>
        {pending ? t("saving") : t("addRevenue")}
      </Button>
      <Alert error={error} />
    </form>
  );
}

export function DeleteRecord({ path }: { path: string }) {
  const t = useTranslations("products");
  const { send, pending, error } = useSubmit();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        className="h-8 px-2 text-[13px]"
        disabled={pending}
        onClick={() => void send(path, "DELETE")}
      >
        {t("delete")}
      </Button>
      <Alert error={error} />
    </span>
  );
}
