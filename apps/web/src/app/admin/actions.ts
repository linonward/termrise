"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logger } from "@repo/observability/logger";

import { getAdminService } from "@/server/admin/admin";
import { AdminError, type AdminErrorCode } from "@/server/admin/admin-service";
import { getAdminSession } from "@/server/auth/auth";

// Every action checks the admin itself: actions are public POST endpoints,
// so the /admin layout check does not protect them.

export type SearchState = { notFound: boolean };

export async function findUser(
  _: SearchState,
  form: FormData,
): Promise<SearchState> {
  if (!(await getAdminSession())) return { notFound: true };
  // The email stays in the request body: never in the URL or the logs.
  const id = await getAdminService().findUserId(
    String(form.get("query") ?? ""),
  );
  if (!id) return { notFound: true };
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

export async function adjustCredits(
  _: AdjustState,
  form: FormData,
): Promise<AdjustState> {
  const amount = String(form.get("amount") ?? "");
  const reason = String(form.get("reason") ?? "");
  const session = await getAdminSession();
  if (!session)
    return { status: "error", code: "USER_NOT_FOUND", amount, reason };
  const userId = String(form.get("userId") ?? "");
  try {
    const result = await getAdminService().adjustCredits({
      actorId: session.user.id,
      userId,
      amount: /^-?\d+$/.test(amount.trim()) ? Number(amount) : NaN,
      id: String(form.get("id") ?? ""),
      reason,
    });
    logger.info("admin.credits_adjusted", {
      actorId: session.user.id,
      userId,
      amount: Number(amount),
      transactionId: result.transactionId,
    });
    // Renders a new adjustment id, so the next submit is a new adjustment.
    revalidatePath(`/admin/users/${encodeURIComponent(userId)}`);
    return { status: "done", balance: result.balance };
  } catch (error) {
    if (error instanceof AdminError)
      return { status: "error", code: error.code, amount, reason };
    logger.error("admin.adjust_failed", {
      actorId: session.user.id,
      userId,
      error,
    });
    return { status: "error", code: "INTERNAL", amount, reason };
  }
}
