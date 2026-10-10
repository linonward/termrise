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

const send = (method: string, path: string, body?: unknown, cookie = owner) =>
  call(path, {
    method,
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function goOpportunity() {
  const project = await (
    await send("POST", "/api/research/projects", {
      name: "Notes",
      seeds: ["meeting notes"],
    })
  ).json();
  await send("POST", `/api/research/projects/${project.id}/runs`, {
    requestId: crypto.randomUUID(),
  });
  await runQueuedResearch();
  const { items } = await (await send("GET", "/api/opportunities")).json();
  const base = `/api/opportunities/${items[0].id}/decisions`;
  await send("POST", base, { decision: "needs_validation", reason: "test" });
  await send("POST", base, { decision: "go", reason: "paid" });
  return items[0].id as string;
}

it("runs a product from a Go opportunity to recorded revenue", async () => {
  const opportunityId = await goOpportunity();
  const created = await send("POST", "/api/execution/projects", {
    opportunityId,
  });
  expect(created.status).toBe(201);
  const product = await created.json();
  expect(product).toMatchObject({
    name: "meeting notes",
    status: "not_started",
  });
  expect(product).not.toHaveProperty("userId");

  const base = `/api/execution/projects/${product.id}`;
  const patched = await send("PATCH", base, {
    status: "launched",
    launchedOn: "2026-10-12",
    domain: "notes.example.com",
  });
  expect(await patched.json()).toMatchObject({ status: "launched" });
  expect(
    (
      await send("POST", `${base}/events`, {
        metric: "visitors",
        count: 120,
        periodStart: "2026-10-12",
        periodEnd: "2026-10-18",
      })
    ).status,
  ).toBe(201);
  const revenue = await (
    await send("POST", `${base}/revenue`, {
      occurredOn: "2026-10-15",
      currency: "USD",
      orders: 2,
      gross: 18,
    })
  ).json();
  expect(revenue).toMatchObject({ source: "manual", fees: null });

  const detail = await (await send("GET", base)).json();
  expect(detail.totals).toMatchObject({
    visitors: 120,
    revenue: [{ currency: "USD", orders: 2, gross: 18, net: null }],
  });
  const { items } = await (
    await send("GET", `/api/execution/projects?opportunityId=${opportunityId}`)
  ).json();
  expect(items.map((p: { id: string }) => p.id)).toEqual([product.id]);

  expect((await send("DELETE", `${base}/revenue/${revenue.id}`)).status).toBe(
    204,
  );
  expect((await send("GET", base, undefined, other)).status).toBe(404);
});

it("refuses a product before Go", async () => {
  const project = await (
    await send("POST", "/api/research/projects", {
      name: "Notes",
      seeds: ["meeting notes"],
    })
  ).json();
  await send("POST", `/api/research/projects/${project.id}/runs`, {
    requestId: crypto.randomUUID(),
  });
  await runQueuedResearch();
  const { items } = await (await send("GET", "/api/opportunities")).json();
  const response = await send("POST", "/api/execution/projects", {
    opportunityId: items[0].id,
  });
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("EXECUTION_NEEDS_GO");
});
