"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

/** Sends a JSON request, shows the API error or refreshes the page. */
export function useSubmit() {
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function send(path: string, method: string, body?: unknown) {
    setPending(true);
    setError(undefined);
    const response = await apiFetch(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    }).catch(() => null);
    const json =
      response?.status === 204
        ? null
        : await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(tErrors(errorCodeOf(response ?? null, json)));
      return null;
    }
    router.refresh();
    return json as unknown;
  }

  return { send, pending, error };
}
