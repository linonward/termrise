import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import type { AiProvider } from "@repo/ai/provider";
import {
  noAnalytics,
  type AnalyticsService,
} from "@repo/analytics/analytics-service";
import { createCreditService, CreditError } from "@repo/credits/credit-service";
import type { Database } from "@repo/db/client";
import { tasks } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import { TASK_CREDIT_COST, TASK_INPUT_MAX_LENGTH } from "./credit-cost";

export { TASK_INPUT_MAX_LENGTH };

// Longer than any function run: a PENDING task this old was lost in a crash or timeout.
export const STALE_TASK_MS = 15 * 60_000;

const debitKey = (taskId: string) => `task:${taskId}:debit`;

const runSchema = z.object({
  requestId: z.uuid(),
  input: z.string().trim().min(1).max(TASK_INPUT_MAX_LENGTH),
});

// Example paid action: debit, run, then SUCCEEDED or FAILED + refund
// (docs/architecture/tasks.md). Only this service changes a task's status.
export function createTaskService(deps: {
  database: Database;
  provider: AiProvider;
  analytics?: AnalyticsService;
  now?: () => Date;
}) {
  const { database, provider } = deps;
  const analytics = deps.analytics ?? noAnalytics;
  const now = deps.now ?? (() => new Date());

  async function create(userId: string, requestId: string, input: string) {
    try {
      return await database.transaction(async (tx) => {
        const [task] = await tx
          .insert(tasks)
          .values({
            userId,
            requestId,
            input,
            status: "PENDING",
            creditsCost: TASK_CREDIT_COST,
          })
          .onConflictDoNothing({ target: [tasks.userId, tasks.requestId] })
          .returning();
        // Charged at the cost snapshot, in the transaction that creates the PENDING task.
        if (task)
          await createCreditService(tx).debit({
            userId,
            taskId: task.id,
            type: "TASK_DEBIT",
            amount: task.creditsCost,
            idempotencyKey: debitKey(task.id),
          });
        return task;
      });
    } catch (error) {
      if (error instanceof CreditError && error.code === "INSUFFICIENT_CREDITS")
        throw new AppError("INSUFFICIENT_CREDITS");
      throw error;
    }
  }

  async function find(userId: string, requestId: string) {
    const [existing] = await database
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.requestId, requestId)));
    return existing;
  }

  async function run(userId: string, body: unknown) {
    const parsed = runSchema.safeParse(body);
    if (!parsed.success) throw new AppError("INVALID_INPUT", "Invalid task");
    const { requestId, input } = parsed.data;
    const task = await create(userId, requestId, input);
    // A retried request returns the first task and is not charged again.
    if (!task) return find(userId, requestId);
    try {
      const { output } = await provider.run(input);
      const [done] = await database
        .update(tasks)
        .set({ status: "SUCCEEDED", output, completedAt: new Date() })
        .where(and(eq(tasks.id, task.id), eq(tasks.status, "PENDING")))
        .returning();
      // The stale cleanup already failed and refunded the task: discard the result.
      if (!done) return find(userId, requestId);
      await analytics.capture(userId, "task_succeeded", { taskId: task.id });
      return done;
    } catch (error) {
      logger.error("task.failed", { taskId: task.id, error });
      await analytics.capture(userId, "task_failed", { taskId: task.id });
      return (
        (await fail(userId, task.id, "PROVIDER_ERROR")) ??
        find(userId, requestId)
      );
    }
  }

  // FAILED and refund in one transaction; a task that already left PENDING is untouched.
  async function fail(userId: string, id: string, errorCode: string) {
    return database.transaction(async (tx) => {
      const [failed] = await tx
        .update(tasks)
        .set({ status: "FAILED", errorCode, completedAt: now() })
        .where(and(eq(tasks.id, id), eq(tasks.status, "PENDING")))
        .returning();
      if (failed)
        await createCreditService(tx).refund({
          userId,
          taskId: id,
          type: "TASK_REFUND",
          debitKey: debitKey(id),
          idempotencyKey: `task:${id}:refund`,
        });
      return failed;
    });
  }

  /** Read-time cleanup: stale PENDING tasks become FAILED and refund their credits. */
  async function failStaleTasks(userId: string) {
    const stale = await database
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "PENDING"),
          lt(tasks.createdAt, new Date(now().getTime() - STALE_TASK_MS)),
        ),
      );
    for (const { id } of stale) {
      logger.warn("task.stale", { taskId: id });
      await fail(userId, id, "TIMEOUT");
    }
  }

  async function list(userId: string, limit = 20) {
    return database
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(limit);
  }

  return { run, list, failStaleTasks };
}

export type Task = typeof tasks.$inferSelect;
