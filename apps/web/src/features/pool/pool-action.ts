"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

/** POSTs JSON to the pool API, then refreshes the page; keeps the error to show. */
export function usePoolAction() {
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function post(path: string, body: unknown) {
    setPending(true);
    setError(undefined);
    const response = await apiFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(tErrors(errorCodeOf(response ?? null, json)));
      return null;
    }
    router.refresh();
    return json;
  }

  return { post, pending, error };
}
