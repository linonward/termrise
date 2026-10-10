import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

const { call, signIn } = createTestClient({
  KEYWORD_PROVIDER: "fake",
  ANALYST_PROVIDER: "fake",
  ALLOW_FAKE_PROVIDERS: "1",
});

let owner: string;
let other: string;
beforeEach(async () => {
  await resetDb();
  owner = await signIn("owner@example.com");
  other = await signIn("other@example.com");
});
afterAll(closeTestDb);

const post = (path: string, body: unknown) =>
  call(path, {
    method: "POST",
    headers: {
      cookie: owner,
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const get = (path: string, cookie = owner) =>
  call(path, { headers: { cookie } });

async function runProject() {
  const project = await (
    await post("/api/research/projects", {
      name: "Notes",
      seeds: ["meeting notes", "invoice tool"],
    })
  ).json();
  const run = await post(`/api/research/projects/${project.id}/runs`, {
    requestId: crypto.randomUUID(),
  });
  expect(run.status).toBe(201);
  return project.id as string;
}

it("lists the ranked opportunities of a run and shows one with its evidence", async () => {
  const projectId = await runProject();
  const { items } = await (
    await get(`/api/opportunities?projectId=${projectId}`)
  ).json();
  expect(items.length).toBe(2);
  expect(items[0]).toMatchObject({
    projectId,
    projectName: "Notes",
    status: "unreviewed",
    scoringVersion: "v1",
    analystProvider: "fake",
    rank: 1,
  });
  expect(items[0]).not.toHaveProperty("evidence");

  const detail = await (await get(`/api/opportunities/${items[0].id}`)).json();
  expect(detail).toMatchObject({ id: items[0].id, score: items[0].score });
  expect(detail.keywords.length).toBeGreaterThan(0);
  expect(detail.serps.length).toBeGreaterThan(0);
  expect(detail.analysis.mvpScope.length).toBeGreaterThan(0);
});

it("hides other users' opportunities", async () => {
  await runProject();
  const { items } = await (await get("/api/opportunities")).json();
  expect((await (await get("/api/opportunities", other)).json()).items).toEqual(
    [],
  );
  const response = await get(`/api/opportunities/${items[0].id}`, other);
  expect(response.status).toBe(404);
  expect((await response.json()).error.code).toBe("OPPORTUNITY_NOT_FOUND");
});

it("requires a session", async () => {
  expect((await call("/api/opportunities")).status).toBe(401);
});
