import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeAnalyst } from "./adapters/fake-analyst";
import { createFakeHackerNews } from "./adapters/fake-hacker-news";
import { createFakeKeywordProvider } from "./adapters/fake-keywords";
import {
  createFavorites,
  eraseRadarFavorites,
  exportRadarFavorites,
} from "./favorites";
import { createOpportunityResults } from "./opportunity-results";
import { createRadar } from "./radar";
import { createResearchRunner } from "./research-runner";
import { createResearchService } from "./research-service";
import { exportResearchData } from "./user-data";

const db = testDb();
const favorites = createFavorites({ database: db });
const radar = createRadar({
  database: db,
  hackerNews: createFakeHackerNews({
    lists: { top: [1, 2] },
    items: [
      { id: 1, type: "story", title: "Invoice parser", score: 5 },
      { id: 2, type: "story", title: "Meeting notes", score: 9 },
    ],
  }),
});

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

it("stars radar items per user and lists the starred only", async () => {
  await radar.collectHackerNews();
  const [first] = await radar.list("a", { q: "invoice" });
  await favorites.starRadarItem("a", first.id, true);
  await favorites.starRadarItem("a", first.id, true);

  expect((await radar.list("a", { starred: "1" })).map((i) => i.title)).toEqual(
    ["Invoice parser"],
  );
  expect((await radar.get("a", first.id)).item.starred).toBe(true);
  // Another user's view is unchanged.
  expect(await radar.list("b", { starred: "1" })).toEqual([]);
  expect((await radar.get("b", first.id)).item.starred).toBe(false);

  expect(await exportRadarFavorites(db, "a")).toEqual([
    expect.objectContaining({
      title: "Invoice parser",
      provider: "hacker_news",
    }),
  ]);
  await favorites.starRadarItem("a", first.id, false);
  await favorites.starRadarItem("a", first.id, false);
  expect(await radar.list("a", { starred: "1" })).toEqual([]);

  await favorites.starRadarItem("a", first.id, true);
  await eraseRadarFavorites(db, "a");
  expect(await exportRadarFavorites(db, "a")).toEqual([]);
  await expect(
    favorites.starRadarItem("a", randomUUID(), true),
  ).rejects.toMatchObject({ code: "RADAR_ITEM_NOT_FOUND" });
});

it("stars the owner's opportunities only, and filters the list", async () => {
  const service = createResearchService({ database: db });
  const runner = createResearchRunner({
    database: db,
    provider: createFakeKeywordProvider(),
    analyst: createFakeAnalyst(),
  });
  const results = createOpportunityResults({ database: db });
  const { id } = await service.create("a", {
    name: "P",
    seeds: ["meeting notes", "invoice tool"],
  });
  await runner.run("a", id, { requestId: randomUUID() });
  const [top] = await results.list("a");

  await expect(
    favorites.starOpportunity("b", top.opportunity.id, true),
  ).rejects.toMatchObject({ code: "OPPORTUNITY_NOT_FOUND" });
  await favorites.starOpportunity("a", top.opportunity.id, true);
  const starred = await results.list("a", undefined, { starred: true });
  expect(starred.map((o) => o.opportunity.id)).toEqual([top.opportunity.id]);
  expect((await results.list("a")).length).toBe(2);
  const [project] = await exportResearchData(db, "a");
  expect(
    project.opportunities.filter((o) => o.starredAt !== null),
  ).toHaveLength(1);

  await favorites.starOpportunity("a", top.opportunity.id, false);
  expect(await results.list("a", undefined, { starred: true })).toEqual([]);
});
