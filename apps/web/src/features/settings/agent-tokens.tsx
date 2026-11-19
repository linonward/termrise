"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { EmptyState } from "@/components/empty-state";
import { LocalDateTime } from "@/components/local-date-time";
import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

export type AgentTokenItem = {
  id: string;
  name: string;
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

// Create, list and revoke agent tokens (docs/product/ux.md#agent-tokens). A new token is
// shown once, right after it is made; the list only has its first 12 characters.
export function AgentTokens({ items }: { items: AgentTokenItem[] }) {
  const t = useTranslations("agentTokens");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string>();
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
      return undefined;
    }
    router.refresh();
    return json as { token?: string } | null;
  }

  return (
    <div className="space-y-8">
      <form
        className="space-y-3 rounded-lg bg-surface px-6 py-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const done = await send("/api/settings/agent-tokens", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (done?.token) {
            setCreated(done.token);
            setName("");
          }
        }}
      >
        <label className="block space-y-2 text-[13px] font-medium">
          <span>{t("nameLabel")}</span>
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="h-10 w-full max-w-sm rounded-md border border-border-strong bg-background px-3 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          />
        </label>
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {t("create")}
        </Button>
        {created && (
          <div role="status" className="space-y-2">
            <p className="text-[13px] font-medium">{t("createdOnce")}</p>
            <code
              data-testid="new-agent-token"
              className="block rounded-md bg-background px-3 py-2 font-mono text-[13px] break-all"
            >
              {created}
            </code>
            <p className="text-[13px] text-muted-foreground">{t("usage")}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
      </form>

      {items.length === 0 ? (
        <EmptyState title={t("emptyTitle")} body={t("emptyText")} />
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-4 font-medium">{t("colName")}</th>
              <th className="py-2 pr-4 font-medium">{t("colToken")}</th>
              <th className="py-2 pr-4 font-medium">{t("colCreated")}</th>
              <th className="py-2 pr-4 font-medium">{t("colLastUsed")}</th>
              <th className="py-2 font-medium">
                <span className="sr-only">{t("colActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="py-3 pr-4 text-[15px]">{item.name}</td>
                <td className="py-3 pr-4 font-mono">{item.preview}…</td>
                <td className="py-3 pr-4">
                  <LocalDateTime iso={item.createdAt} />
                </td>
                <td className="py-3 pr-4">
                  {item.lastUsedAt ? (
                    <LocalDateTime iso={item.lastUsedAt} />
                  ) : (
                    t("neverUsed")
                  )}
                </td>
                <td className="py-3 text-right">
                  {item.revokedAt ? (
                    <span className="text-muted-foreground">
                      {t("revoked")}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-3"
                      disabled={pending}
                      onClick={() =>
                        void send(`/api/settings/agent-tokens/${item.id}`, {
                          method: "DELETE",
                        })
                      }
                    >
                      {t("revoke")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
