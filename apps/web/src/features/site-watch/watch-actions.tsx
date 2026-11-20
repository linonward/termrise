"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

async function send(path: string, init: RequestInit) {
  const response = await apiFetch(path, init).catch(() => null);
  const json =
    response && response.status !== 204
      ? await response.json().catch(() => null)
      : null;
  return { ok: !!response?.ok, code: errorCodeOf(response ?? null, json) };
}

// Add a section to watch (docs/product/keyword-pool.md#site-watch).
export function AddWatch() {
  const t = useTranslations("discover");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [role, setRole] = useState<"signal" | "confirm">("signal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!url.trim()) return;
        setPending(true);
        setError(undefined);
        const r = await send("/api/pool/watch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, role }),
        });
        setPending(false);
        if (!r.ok) return setError(tErrors(r.code));
        setUrl("");
        router.refresh();
      }}
    >
      <label className="min-w-64 flex-1 space-y-2 text-[13px] font-medium">
        <span>{t("watchAddLabel")}</span>
        <input
          value={url}
          maxLength={500}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="imagelayered.com/tools/"
          className="h-10 w-full rounded-md border border-border-strong bg-background px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        />
      </label>
      <label className="space-y-2 text-[13px] font-medium">
        <span>{t("watchRoleLabel")}</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "signal" | "confirm")}
          className="h-10 rounded-md border border-border-strong bg-background px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <option value="signal">{t("watchRole.signal")}</option>
          <option value="confirm">{t("watchRole.confirm")}</option>
        </select>
      </label>
      <Button type="submit" className="h-10 px-4" disabled={pending}>
        {t("watchAdd")}
      </Button>
      {error && (
        <p role="alert" className="w-full text-[13px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function RemoveWatch({ id }: { id: string }) {
  const t = useTranslations("discover");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="h-8 px-3"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await send(`/api/pool/watch/${id}`, { method: "DELETE" });
        setPending(false);
        router.refresh();
      }}
    >
      {t("watchRemove")}
    </Button>
  );
}

/** Switches a section between a signal and a cross-check. */
export function SwitchRole({
  id,
  role,
}: {
  id: string;
  role: "signal" | "confirm";
}) {
  const t = useTranslations("discover");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const next = role === "signal" ? "confirm" : "signal";
  return (
    <Button
      type="button"
      variant="outline"
      className="h-8 px-3"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await send(`/api/pool/watch/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: next }),
        });
        setPending(false);
        router.refresh();
      }}
    >
      {t(`watchMakeRole.${next}`)}
    </Button>
  );
}
