import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  opportunities,
  opportunityEvaluations,
  opportunityKeywordReviews,
  researchProjects,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

import { rescoreOpportunity } from "./evaluate";

const reviewSchema = z.object({ offTopic: z.boolean() });
const isUuid = (id: string) => z.uuid().safeParse(id).success;

// The owner's review of the off-topic marks (docs/architecture/data-model.md#opportunities):
// the analysis only suggests them; the owner's call wins and the score follows it.
export function createOffTopicReviews(deps: {
  database: Database;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  /** Sets whether one keyword is off topic and scores the opportunity again. */
  async function review(
    userId: string,
    opportunityId: string,
    keywordId: string,
    body: unknown,
  ) {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) throw new AppError("INVALID_INPUT", "Invalid input");
    if (!isUuid(opportunityId))
      throw new AppError("OPPORTUNITY_NOT_FOUND", "Opportunity not found");
    return database.transaction(async (tx) => {
      // Locked, so two reviews of one opportunity score it one after the other.
      const [owned] = await tx
        .select({ id: opportunities.id })
        .from(opportunities)
        .innerJoin(
          researchProjects,
          eq(opportunities.projectId, researchProjects.id),
        )
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(researchProjects.userId, userId),
          ),
        )
        .for("update", { of: opportunities });
      if (!owned)
        throw new AppError("OPPORTUNITY_NOT_FOUND", "Opportunity not found");
      const [current] = await tx
        .select({ evidence: opportunityEvaluations.evidence })
        .from(opportunityEvaluations)
        .where(eq(opportunityEvaluations.opportunityId, opportunityId))
        .orderBy(
          desc(opportunityEvaluations.createdAt),
          desc(opportunityEvaluations.id),
        )
        .limit(1);
      if (!current?.evidence.keywordIds.includes(keywordId))
        throw new AppError("KEYWORD_NOT_FOUND", "Keyword not found");
      await tx
        .insert(opportunityKeywordReviews)
        .values({
          opportunityId,
          keywordId,
          offTopic: parsed.data.offTopic,
          reviewerId: userId,
        })
        .onConflictDoUpdate({
          target: [
            opportunityKeywordReviews.opportunityId,
            opportunityKeywordReviews.keywordId,
          ],
          set: {
            offTopic: parsed.data.offTopic,
            reviewerId: userId,
            updatedAt: now(),
          },
        });
      return rescoreOpportunity(tx, opportunityId, now());
    });
  }

  return { review };
}
