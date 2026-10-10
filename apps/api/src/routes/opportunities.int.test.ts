import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { runQueuedResearch } from "../testing/research-worker";
import { TEST_APP_URL } from "../testing/worker";

const { call, signIn } = createTestClient();

let owner: string;
let other: string;
beforeEach(async () => {
  await resetDb();
  owner = await signIn("owner@example.com");
  other = await signIn("other@example.com");
});
afterAll(closeTestDb);

const post = (path: string, body: unknown, cookie = owner, method = "POST") =>
  call(path, {
    method,
    headers: {
      cookie,
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
  await runQueuedResearch();
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

it("records a decision and an experiment, and shows them in the detail", async () => {
  await runProject();
  const { items } = await (await get("/api/opportunities")).json();
  const base = `/api/opportunities/${items[0].id}`;
  expect(items[0].nextDecisions).toEqual(["needs_validation", "no_go"]);

  const decided = await post(`${base}/decisions`, {
    decision: "needs_validation",
    reason: "Worth a smoke test",
  });
  expect(decided.status).toBe(201);
  const invalid = await post(`${base}/decisions`, {
    decision: "needs_validation",
    reason: "x",
  });
  expect(invalid.status).toBe(409);
  expect((await invalid.json()).error.code).toBe(
    "OPPORTUNITY_DECISION_INVALID",
  );

  const created = await post(`${base}/experiments`, {
    kind: "free_tool",
    hypothesis: "People use a free summary tool",
    channel: "Product Hunt",
    metric: "weekly active users",
    budgetUsd: 0,
    durationDays: 7,
    successThreshold: "50 users",
    stopCondition: "Under 10 users after 7 days",
  });
  expect(created.status).toBe(201);
  const experiment = await created.json();
  const moved = await post(
    `${base}/experiments/${experiment.id}`,
    { status: "running" },
    owner,
    "PATCH",
  );
  expect(await moved.json()).toMatchObject({ status: "running" });

  const detail = await (await get(base)).json();
  expect(detail).toMatchObject({
    status: "needs_validation",
    nextDecisions: ["go", "no_go"],
    decisions: [{ decision: "needs_validation", reason: "Worth a smoke test" }],
    experiments: [{ id: experiment.id, status: "running" }],
  });
  expect(detail.decisions[0]).not.toHaveProperty("deciderId");

  const foreign = await post(
    `${base}/decisions`,
    { decision: "no_go", reason: "x" },
    other,
  );
  expect(foreign.status).toBe(404);
});

it("exports the Product Brief as Markdown", async () => {
  await runProject();
  const { items } = await (await get("/api/opportunities")).json();
  const response = await get(`/api/opportunities/${items[0].id}/brief.md`);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe(
    "text/markdown; charset=utf-8",
  );
  expect(response.headers.get("Content-Disposition")).toMatch(
    /^attachment; filename="brief-[a-z0-9-]+\.md"$/,
  );
  const md = await response.text();
  expect(md).toContain(`# Product Brief: ${items[0].cluster}`);
  expect(md).toContain("**Test data.**");
  expect(
    (await get(`/api/opportunities/${items[0].id}/brief.md`, other)).status,
  ).toBe(404);
});

it("stars an opportunity and lists the starred only", async () => {
  await runProject();
  const { items } = await (await get("/api/opportunities")).json();
  const starred = await post(
    `/api/opportunities/${items[0].id}/star`,
    {},
    owner,
    "PUT",
  );
  expect(await starred.json()).toEqual({ starred: true });
  const list = await (await get("/api/opportunities?starred=1")).json();
  expect(list.items.map((o: { id: string }) => o.id)).toEqual([items[0].id]);
  expect(list.items[0].starred).toBe(true);
  expect(
    (await post(`/api/opportunities/${items[0].id}/star`, {}, other, "PUT"))
      .status,
  ).toBe(404);
  await post(`/api/opportunities/${items[0].id}/star`, {}, owner, "DELETE");
  expect(
    (await (await get("/api/opportunities?starred=1")).json()).items,
  ).toEqual([]);
});
