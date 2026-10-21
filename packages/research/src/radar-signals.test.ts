import { expect, it } from "vitest";

import { radarSignalRows } from "./radar-signals";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "hacker_news" as const,
  externalId: "42",
  url: "https://example.com/tool",
  title: "Show HN: Tool – check a drone path",
  normalizedTerm: "tool – check a drone path",
};
const at = (iso: string) => ({ observedAt: new Date(iso) });

it("writes one signal per UTC day, at the first observation of the day", () => {
  const rows = radarSignalRows("p", item, [
    at("2026-10-20T23:00:00Z"),
    at("2026-10-20T08:00:00Z"),
    at("2026-10-21T01:00:00Z"),
  ]);
  expect(rows).toEqual([
    {
      projectId: "p",
      provider: "hacker_news",
      externalId: "42:2026-10-20",
      url: "https://example.com/tool",
      rawTitle: "Show HN: Tool – check a drone path",
      normalizedTerm: "tool – check a drone path",
      observedAt: new Date("2026-10-20T08:00:00Z"),
      metadata: { source: "Hacker News", radarItemId: item.id },
    },
    expect.objectContaining({
      externalId: "42:2026-10-21",
      observedAt: new Date("2026-10-21T01:00:00Z"),
    }),
  ]);
});

it("names the source for the score's distribution and the analysis", () => {
  const [row] = radarSignalRows(
    "p",
    { ...item, provider: "google_trends", externalId: "us:2026-10-21:ncis" },
    [at("2026-10-21T01:00:00Z")],
  );
  expect(row.metadata).toMatchObject({ source: "Google Trends" });
});

it("writes nothing for an item without observations", () => {
  expect(radarSignalRows("p", item, [])).toEqual([]);
});
