import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { researchProjects, sourceSignals, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { toSourceSignalDto } from "./research-dto";
import { createResearchService } from "./research-service";
import { exportResearchData } from "./user-data";

const db = testDb();
const service = createResearchService({ database: db });

let projectId: string;
beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
  projectId = (await service.create("a", { name: "P", seeds: ["seed"] })).id;
});
afterAll(closeTestDb);

const csv = (rows: string[]) =>
  ["term,url,observed_at,source", ...rows].join("\n");
const seeds = async () => (await service.get("a", projectId)).seeds;

it("imports rows as signals and adds new terms to the seeds", async () => {
  const result = await service.importCsv("a", projectId, {
    csv: csv([
      "AI Meeting Notes,https://example.com/a,2026-10-01,trends",
      "seed,,,",
      ",https://example.com/no-term,,",
      "bad,not-a-url,,",
    ]),
  });
  expect(result).toEqual({
    imported: 2,
    duplicates: 0,
    rejectedCount: 2,
    rejected: [
      { line: 4, reason: "missing_term" },
      { line: 5, reason: "invalid_url" },
    ],
    seedsAdded: 1,
    seedsSkipped: 0,
  });
  expect(await seeds()).toEqual(["seed", "ai meeting notes"]);
  const [newest] = await service.listSignals("a", projectId);
  expect(toSourceSignalDto(newest)).toMatchObject({
    term: "ai meeting notes",
    rawTitle: "AI Meeting Notes",
    url: "https://example.com/a",
    observedAt: "2026-10-01T00:00:00.000Z",
    source: "trends",
  });
});

it("counts a re-imported row as a duplicate", async () => {
  const body = { csv: csv(["foo,,2026-10-01,", "bar,,,"]) };
  await service.importCsv("a", projectId, body);
  expect(await service.importCsv("a", projectId, body)).toMatchObject({
    imported: 0,
    duplicates: 2,
    seedsAdded: 0,
  });
  expect(await service.listSignals("a", projectId)).toHaveLength(2);
});

it("keeps all signals but adds seeds only up to 50", async () => {
  const rows = Array.from({ length: 60 }, (_, i) => `term ${i},,,`);
  expect(
    await service.importCsv("a", projectId, { csv: csv(rows) }),
  ).toMatchObject({ imported: 60, seedsAdded: 49, seedsSkipped: 11 });
  expect(await seeds()).toHaveLength(50);
  expect(await service.listSignals("a", projectId)).toHaveLength(60);
});

it("loses no seed when two imports run at once", async () => {
  await Promise.all([
    service.importCsv("a", projectId, { csv: csv(["first,,,"]) }),
    service.importCsv("a", projectId, { csv: csv(["second,,,"]) }),
  ]);
  expect((await seeds()).sort()).toEqual(["first", "second", "seed"]);
});

it("rejects a bad file, another user's project and a project that is not a draft", async () => {
  await expect(
    service.importCsv("a", projectId, { csv: "keyword\nfoo" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    details: { reason: "missing_term_column" },
  });
  await expect(
    service.importCsv("b", projectId, { csv: csv(["foo,,,"]) }),
  ).rejects.toMatchObject({ code: "RESEARCH_PROJECT_NOT_FOUND" });
  await expect(service.listSignals("b", projectId)).rejects.toMatchObject({
    code: "RESEARCH_PROJECT_NOT_FOUND",
  });
  await db
    .update(researchProjects)
    .set({ status: "collecting" })
    .where(eq(researchProjects.id, projectId));
  await expect(
    service.importCsv("a", projectId, { csv: csv(["foo,,,"]) }),
  ).rejects.toMatchObject({ code: "RESEARCH_PROJECT_LOCKED" });
  expect(await db.select().from(sourceSignals)).toEqual([]);
});

it("exports signals with their project and deletes them with it", async () => {
  await service.importCsv("a", projectId, { csv: csv(["foo,,,"]) });
  expect(await exportResearchData(db, "a")).toMatchObject([
    { name: "P", signals: [{ term: "foo", provider: "csv" }] },
  ]);
  await service.remove("a", projectId);
  expect(await db.select().from(sourceSignals)).toEqual([]);
});
