import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { FAKE_AI_FAILURE } from "@repo/ai/adapters/fake";
import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

const { call, signIn } = createTestClient({
  TASK_PROVIDER: "fake",
  ALLOW_FAKE_PROVIDERS: "1",
});

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("tasks@example.com", { credits: 10 });
});
afterAll(closeTestDb);

// As the web app's browser code sends it.
const run = (input: string, headers: Record<string, string> = {}) =>
  call("/api/tasks", {
    method: "POST",
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ requestId: randomUUID(), input }),
  });

const list = () => call("/api/tasks", { headers: { cookie } });

it("runs a task for the signed-in user and lists it", async () => {
  const created = await run("hello");
  expect(created.status).toBe(201);
  expect(created.headers.get("Access-Control-Allow-Origin")).toBe(TEST_APP_URL);
  const task = await created.json();
  expect(task).toMatchObject({
    status: "SUCCEEDED",
    output: "HELLO",
    creditsCost: 1,
  });
  expect(task).not.toHaveProperty("requestId");

  const failed = await (await run(`x ${FAKE_AI_FAILURE}`)).json();
  expect(failed).toMatchObject({
    status: "FAILED",
    errorCode: "PROVIDER_ERROR",
  });

  const { items } = await (await list()).json();
  expect(items.map((t: { id: string }) => t.id)).toEqual([failed.id, task.id]);
});

it("answers 401 without a session, readable by the web app", async () => {
  const response = await call("/api/tasks", {
    headers: { Origin: TEST_APP_URL },
  });
  expect(response.status).toBe(401);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    TEST_APP_URL,
  );
  expect((await response.json()).error.code).toBe("UNAUTHORIZED");
});

it("answers the CORS preflight of the web app only", async () => {
  const preflight = (origin: string) =>
    call("/api/tasks", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
  const allowed = await preflight(TEST_APP_URL);
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  const other = await preflight("https://evil.example");
  expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

it("rejects a form post from another origin", async () => {
  const response = await run("hello", {
    Origin: "https://evil.example",
    "Content-Type": "text/plain",
  });
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
  const { items } = await (await list()).json();
  expect(items).toEqual([]);
});

it("rejects a body that is not JSON", async () => {
  const response = await call("/api/tasks", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: "{",
  });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_INPUT");
});

it("allows ten runs a minute, then answers 429", async () => {
  for (let i = 0; i < 10; i++)
    expect((await run("hello")).status, `run ${i + 1}`).not.toBe(429);
  const limited = await run("hello");
  expect(limited.status).toBe(429);
  expect((await limited.json()).error.code).toBe("RATE_LIMITED");
  expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
});

it("lists at most the requested number of tasks", async () => {
  for (const input of ["one", "two", "three"]) await run(input);
  const { items } = await (
    await call("/api/tasks?limit=2", { headers: { cookie } })
  ).json();
  expect(items.map((t: { input: string }) => t.input)).toEqual([
    "three",
    "two",
  ]);
  for (const limit of ["0", "21", "x"])
    expect(
      (await call(`/api/tasks?limit=${limit}`, { headers: { cookie } })).status,
    ).toBe(400);
});
