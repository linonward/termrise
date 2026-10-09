import "server-only";

import { TASK_CREDIT_COST } from "@/features/tasks/credit-cost";
import { getTaskService } from "@/features/tasks/tasks";

// The only place platform code (server/, components/) reaches the product's paid
// action. Replacing the example changes features/<name>/ and this file; ESLint
// rejects other imports of @/features/* outside app/ and features/.

/** Credits one use costs; the pricing figures divide by it. */
export const CREDIT_COST_PER_USE = TASK_CREDIT_COST;

/** Runs before a balance read: timed-out paid records refund first. */
export const beforeBalanceRead = (userId: string) =>
  getTaskService().failStaleTasks(userId);

/** The user's newest paid records, for the admin console. */
export const listPaidRecords = (userId: string, limit: number) =>
  getTaskService().list(userId, limit);
