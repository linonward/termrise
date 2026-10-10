import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  opportunities,
  radarFavorites,
  radarItems,
  researchProjects,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Stars (docs/architecture/data-model.md#favorites): an owner stars an opportunity, any
// user stars a global radar item. Starring twice or unstarring twice changes nothing.
export function createFavorites(deps: {
  database: Database;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  async function starOpportunity(userId: string, id: string, starred: boolean) {
    if (!z.uuid().safeParse(id).success)
      throw new AppError("OPPORTUNITY_NOT_FOUND", "Opportunity not found");
    const [owned] = await database
      .select({ id: opportunities.id, starredAt: opportunities.starredAt })
      .from(opportunities)
      .innerJoin(
        researchProjects,
        eq(opportunities.projectId, researchProjects.id),
      )
      .where(
        and(eq(opportunities.id, id), eq(researchProjects.userId, userId)),
      );
    if (!owned)
      throw new AppError("OPPORTUNITY_NOT_FOUND", "Opportunity not found");
    // Starring again keeps the first time.
    if (starred === (owned.starredAt !== null)) return { starred };
    await database
      .update(opportunities)
      .set({ starredAt: starred ? now() : null })
      .where(eq(opportunities.id, id));
    return { starred };
  }

  async function starRadarItem(
    userId: string,
    itemId: string,
    starred: boolean,
  ) {
    if (!z.uuid().safeParse(itemId).success)
      throw new AppError("RADAR_ITEM_NOT_FOUND", "Radar item not found");
    const [item] = await database
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.id, itemId));
    if (!item)
      throw new AppError("RADAR_ITEM_NOT_FOUND", "Radar item not found");
    if (starred)
      await database
        .insert(radarFavorites)
        .values({ userId, itemId, createdAt: now() })
        .onConflictDoNothing();
    else
      await database
        .delete(radarFavorites)
        .where(
          and(
            eq(radarFavorites.userId, userId),
            eq(radarFavorites.itemId, itemId),
          ),
        );
    return { starred };
  }

  return { starOpportunity, starRadarItem };
}

// Account export and deletion: the user row stays when an account is deleted
// (anonymized), so its stars are deleted here, not by the foreign key.
export async function exportRadarFavorites(database: Database, userId: string) {
  return database
    .select({
      title: radarItems.title,
      url: radarItems.url,
      provider: radarItems.provider,
      starredAt: radarFavorites.createdAt,
    })
    .from(radarFavorites)
    .innerJoin(radarItems, eq(radarFavorites.itemId, radarItems.id))
    .where(eq(radarFavorites.userId, userId))
    .orderBy(asc(radarFavorites.createdAt));
}

export async function eraseRadarFavorites(
  database: Database | Transaction,
  userId: string,
) {
  await database
    .delete(radarFavorites)
    .where(eq(radarFavorites.userId, userId));
}
