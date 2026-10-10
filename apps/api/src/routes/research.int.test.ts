import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { expectRateLimited } from "../testing/rate-limit";
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

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  call(path, {
    method,
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const create = (cookie = owner) =>
  send("POST", "/api/research/projects", cookie, {
    name: "AI meeting notes",
    seeds: ["AI meeting notes", "sales call summary"],
  });

it("creates, lists, reads, updates and deletes a draft project", async () => {
  const created = await create();
  expect(created.status).toBe(201);
  expect(created.headers.get("Access-Control-Allow-Origin")).toBe(TEST_APP_URL);
  const project = await created.json();
  expect(project).toMatchObject({
    name: "AI meeting notes",
    seeds: ["ai meeting notes", "sales call summary"],
    dataBudgetUsd: 20,
    aiBudgetUsd: 5,
    status: "draft",
  });
  expect(project).not.toHaveProperty("userId");

  const { items } = await (
    await call("/api/research/projects", { headers: { cookie: owner } })
  ).json();
  expect(items.map((p: { id: string }) => p.id)).toEqual([project.id]);

  const path = `/api/research/projects/${project.id}`;
  const updated = await send("PATCH", path, owner, { dataBudgetUsd: 7.5 });
  expect(await updated.json()).toMatchObject({ dataBudgetUsd: 7.5 });
  expect((await call(path, { headers: { cookie: owner } })).status).toBe(200);

  expect((await send("DELETE", path, owner)).status).toBe(204);
  expect((await call(path, { headers: { cookie: owner } })).status).toBe(404);
});

it("keeps projects private to their owner", async () => {
  const project = await (await create()).json();
  const path = `/api/research/projects/${project.id}`;
  for (const response of [
    await call(path, { headers: { cookie: other } }),
    await send("PATCH", path, other, { name: "mine" }),
    await send("DELETE", path, other),
  ]) {
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe(
      "RESEARCH_PROJECT_NOT_FOUND",
    );
  }
  const { items } = await (
    await call("/api/research/projects", { headers: { cookie: other } })
  ).json();
  expect(items).toEqual([]);
});

it("rejects invalid input and needs a session", async () => {
  const invalid = await send("POST", "/api/research/projects", owner, {
    name: "x",
    seeds: [],
  });
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error.code).toBe("INVALID_INPUT");
  expect((await call("/api/research/projects")).status).toBe(401);
});

it("allows 30 project writes a minute, then answers 429", async () => {
  const limited = await expectRateLimited(create, 30);
  expect((await limited.json()).error.code).toBe("RATE_LIMITED");
  // Reads are not limited.
  expect(
    (await call("/api/research/projects", { headers: { cookie: owner } }))
      .status,
  ).toBe(200);
});

it("imports a CSV into a draft and lists its signals", async () => {
  const project = await (await create()).json();
  const base = `/api/research/projects/${project.id}`;
  const imported = await send("POST", `${base}/import`, owner, {
    csv: "term,url\nZoom summary,https://example.com/z\nbad,ftp://x\n",
  });
  expect(await imported.json()).toEqual({
    imported: 1,
    duplicates: 0,
    rejectedCount: 1,
    rejected: [{ line: 3, reason: "invalid_url" }],
    seedsAdded: 1,
    seedsSkipped: 0,
  });
  const { items } = await (
    await call(`${base}/signals`, { headers: { cookie: owner } })
  ).json();
  expect(items).toMatchObject([
    { term: "zoom summary", url: "https://example.com/z", provider: "csv" },
  ]);
  expect(items[0]).not.toHaveProperty("externalId");

  const bad = await send("POST", `${base}/import`, owner, { csv: "x\n1\n" });
  expect(bad.status).toBe(400);
  expect((await bad.json()).error).toMatchObject({
    code: "INVALID_INPUT",
    reason: "missing_term_column",
  });
  expect(
    (await send("POST", `${base}/import`, other, { csv: "term\nfoo\n" }))
      .status,
  ).toBe(404);
});

it("refuses to run without a keyword provider", async () => {
  const project = await (await create()).json();
  const response = await send(
    "POST",
    `/api/research/projects/${project.id}/runs`,
    owner,
    { requestId: crypto.randomUUID() },
  );
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe(
    "RESEARCH_PROVIDER_UNAVAILABLE",
  );
});

it("runs a project with the fake provider and lists what it stored", async () => {
  const withProvider = createTestClient({
    KEYWORD_PROVIDER: "fake",
    ANALYST_PROVIDER: "fake",
    ALLOW_FAKE_PROVIDERS: "1",
  });
  const cookie = await withProvider.signIn("runner@example.com");
  const project = await (
    await withProvider.call("/api/research/projects", {
      method: "POST",
      headers: {
        cookie,
        Origin: TEST_APP_URL,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Run me", seeds: ["meeting notes"] }),
    })
  ).json();
  const base = `/api/research/projects/${project.id}`;
  const run = await withProvider.call(`${base}/runs`, {
    method: "POST",
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId: crypto.randomUUID() }),
  });
  expect(run.status).toBe(201);
  expect(await run.json()).toMatchObject({
    status: "completed",
    errorCode: null,
  });
  const get = async (path: string) =>
    (
      await withProvider.call(`${base}/${path}`, { headers: { cookie } })
    ).json();
  const { items: keywords } = await get("keywords");
  expect(keywords).toHaveLength(8);
  expect(keywords[0]).toMatchObject({ provider: "fake" });
  expect(keywords[0]).toHaveProperty("cpcUsd");
  const { items: serps } = await get("serps");
  expect(serps[0].results).toHaveLength(10);
  const { items: runs } = await get("runs");
  expect(runs).toHaveLength(1);
  expect(
    (
      await withProvider.call(`${base}/keywords`, {
        headers: { cookie: other },
      })
    ).status,
  ).toBe(404);
});
