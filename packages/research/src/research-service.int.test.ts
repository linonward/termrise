import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { researchProjects, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { toResearchProjectDto } from "./research-dto";
import { createResearchService } from "./research-service";
import { eraseResearchData, exportResearchData } from "./user-data";

const db = testDb();
const service = createResearchService({ database: db });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

const valid = {
  name: " AI meeting notes ",
  seeds: ["AI Meeting Notes", "ai meeting notes", " sales  call summary "],
};

it("creates a draft in the default market with default budgets", async () => {
  const project = await service.create("a", valid);
  expect(toResearchProjectDto(project)).toMatchObject({
    name: "AI meeting notes",
    seeds: ["ai meeting notes", "sales call summary"],
    locationCode: 2840,
    languageCode: "en",
    dataBudgetUsd: 20,
    aiBudgetUsd: 5,
    status: "draft",
  });
  expect(project.dataBudgetMicros).toBe(20_000_000);
});

it("stores budgets in whole cents as micro-USD", async () => {
  const project = await service.create("a", {
    ...valid,
    dataBudgetUsd: 12.34,
    aiBudgetUsd: 0,
  });
  expect(project.dataBudgetMicros).toBe(12_340_000);
  expect(project.aiBudgetMicros).toBe(0);
});

it.each([
  { ...valid, name: "  " },
  { ...valid, name: "x".repeat(101) },
  { ...valid, seeds: [] },
  { ...valid, seeds: [" ", ""] },
  { ...valid, seeds: Array.from({ length: 51 }, (_, i) => `seed ${i}`) },
  { ...valid, seeds: ["x".repeat(81)] },
  { ...valid, dataBudgetUsd: -1 },
  { ...valid, dataBudgetUsd: 1000.01 },
  { ...valid, aiBudgetUsd: 1.005 },
  { name: "x" },
  "not an object",
])("rejects invalid input %#", async (body) => {
  await expect(service.create("a", body)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});

it("lists only the user's projects, newest first", async () => {
  await service.create("a", { ...valid, name: "one" });
  await service.create("a", { ...valid, name: "two" });
  await service.create("b", { ...valid, name: "other" });
  expect((await service.list("a")).map((p) => p.name)).toEqual(["two", "one"]);
});

it("hides another user's project and malformed ids as not found", async () => {
  const project = await service.create("a", valid);
  for (const [userId, id] of [
    ["b", project.id],
    ["a", randomUUID()],
    ["a", "not-a-uuid"],
  ])
    await expect(service.get(userId, id)).rejects.toMatchObject({
      code: "RESEARCH_PROJECT_NOT_FOUND",
    });
  await expect(
    service.update("b", project.id, { name: "x" }),
  ).rejects.toMatchObject({ code: "RESEARCH_PROJECT_NOT_FOUND" });
  await expect(service.remove("b", project.id)).rejects.toMatchObject({
    code: "RESEARCH_PROJECT_NOT_FOUND",
  });
});

it("updates only the given fields of a draft", async () => {
  const later = new Date("2027-01-01T00:00:00Z");
  const project = await createResearchService({
    database: db,
    now: () => later,
  }).create("a", valid);
  const updated = await createResearchService({
    database: db,
    now: () => later,
  }).update("a", project.id, { seeds: ["New Seed"], aiBudgetUsd: 2.5 });
  expect(updated).toMatchObject({
    name: "AI meeting notes",
    seeds: ["new seed"],
    aiBudgetMicros: 2_500_000,
    dataBudgetMicros: 20_000_000,
  });
  expect(updated.updatedAt).toEqual(later);
});

it("locks a project that is no longer a draft", async () => {
  const project = await service.create("a", valid);
  await db
    .update(researchProjects)
    .set({ status: "collecting" })
    .where(eq(researchProjects.id, project.id));
  await expect(
    service.update("a", project.id, { name: "x" }),
  ).rejects.toMatchObject({ code: "RESEARCH_PROJECT_LOCKED" });
  await expect(service.remove("a", project.id)).rejects.toMatchObject({
    code: "RESEARCH_PROJECT_LOCKED",
  });
  expect(await service.get("a", project.id)).toMatchObject({
    name: "AI meeting notes",
  });
});

it("deletes a draft", async () => {
  const project = await service.create("a", valid);
  await service.remove("a", project.id);
  expect(await service.list("a")).toEqual([]);
});

it("exports and erases a user's projects for account requests", async () => {
  await service.create("a", valid);
  await service.create("b", valid);
  expect(await exportResearchData(db, "a")).toMatchObject([
    {
      name: "AI meeting notes",
      seeds: ["ai meeting notes", "sales call summary"],
    },
  ]);
  await eraseResearchData(db, "a");
  expect(await service.list("a")).toEqual([]);
  expect(await service.list("b")).toHaveLength(1);
});
