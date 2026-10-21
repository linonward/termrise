import type { radarItems, sourceSignals } from "@repo/db/schema";

type Item = Pick<
  typeof radarItems.$inferSelect,
  "id" | "provider" | "externalId" | "url" | "title" | "normalizedTerm"
>;

// The name scoring counts as a distinct channel and the analysis sees as a source.
const SOURCE_NAMES: Record<Item["provider"], string> = {
  hacker_news: "Hacker News",
  google_trends: "Google Trends",
};

/**
 * A radar item's observations as signals of a project started from it
 * (docs/architecture/data-model.md#source-signals): one per UTC day, at the first
 * observation of that day, so the score's trend counts the days the radar saw it.
 */
export function radarSignalRows(
  projectId: string,
  item: Item,
  observations: { observedAt: Date }[],
): (typeof sourceSignals.$inferInsert)[] {
  const firstByDay = new Map<string, Date>();
  for (const { observedAt } of observations) {
    const day = observedAt.toISOString().slice(0, 10);
    const first = firstByDay.get(day);
    if (!first || observedAt < first) firstByDay.set(day, observedAt);
  }
  return [...firstByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, observedAt]) => ({
      projectId,
      provider: item.provider,
      externalId: `${item.externalId}:${day}`,
      url: item.url,
      rawTitle: item.title,
      normalizedTerm: item.normalizedTerm,
      observedAt,
      metadata: { source: SOURCE_NAMES[item.provider], radarItemId: item.id },
    }));
}
