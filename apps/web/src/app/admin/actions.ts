"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AdminErrorCode } from "@repo/admin/admin-rules";
import { logger } from "@repo/observability/logger";

import { apiRequest } from "@/server/api/api";

// Actions are public POST endpoints; apps/api checks the admin on every call, so a
// non-admin gets the same answer as for an unknown user.

export type SearchState = { notFound: boolean };

export async function findUser(
  _: SearchState,
  form: FormData,
): Promise<SearchState> {
  // The email stays in the request body: never in the URL or the logs.
  const response = await apiRequest("/api/admin/users/search", {
    method: "POST",
    body: JSON.stringify({ query: String(form.get("query") ?? "") }),
  });
  if (!response.ok) return { notFound: true };
  const { id } = (await response.json()) as { id: string };
  redirect(`/admin/users/${encodeURIComponent(id)}`);
}

export type AdjustState =
  | { status: "idle" }
  | { status: "done"; balance: number }
  | {
      status: "error";
      code: AdminErrorCode | "INTERNAL";
      amount: string;
      reason: string;
    };

const ADMIN_ERRORS = new Set<string>([
  "INVALID_INPUT",
  "INVALID_AMOUNT",
  "INVALID_REASON",
  "USER_NOT_FOUND",
  "INSUFFICIENT_CREDITS",
  "IDEMPOTENCY_CONFLICT",
] satisfies AdminErrorCode[]);

export async function adjustCredits(
  _: AdjustState,
  form: FormData,
): Promise<AdjustState> {
  const amount = String(form.get("amount") ?? "");
  const reason = String(form.get("reason") ?? "");
  const userId = String(form.get("userId") ?? "");
  const response = await apiRequest(
    `/api/admin/users/${encodeURIComponent(userId)}/credits`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: /^-?\d+$/.test(amount.trim()) ? Number(amount) : null,
        id: String(form.get("id") ?? ""),
        reason,
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    balance?: number;
    error?: { code?: string };
  } | null;
  if (response.ok && typeof body?.balance === "number") {
    // Renders a new adjustment id, so the next submit is a new adjustment.
    revalidatePath(`/admin/users/${encodeURIComponent(userId)}`);
    return { status: "done", balance: body.balance };
  }
  const code = body?.error?.code;
  // 404 NOT_FOUND: not an admin (any more); shown like an unknown user.
  if (response.status === 404)
    return { status: "error", code: "USER_NOT_FOUND", amount, reason };
  if (code && ADMIN_ERRORS.has(code))
    return {
      status: "error",
      code: code as AdminErrorCode,
      amount,
      reason,
    };
  logger.error("admin.adjust_failed", { userId, status: response.status });
  return { status: "error", code: "INTERNAL", amount, reason };
}
