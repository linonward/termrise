import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import {
  opportunities,
  researchProjects,
  revenueEvents,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { toExecutionDetailDto } from "./execution-dto";
import { createExecutionService } from "./execution-service";
import { eraseExecutionData, exportExecutionData } from "./user-data";

const db = testDb();
const service = createExecutionService({ database: db });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

async function opportunity(status: "go" | "needs_validation" = "go") {
  const [project] = await db
    .insert(researchProjects)
    .values({
      userId: "a",
      name: "P",
      seeds: ["meeting notes"],
      locationCode: 2840,
      languageCode: "en",
      dataBudgetMicros: 0,
      aiBudgetMicros: 0,
    })
    .returning();
  const [row] = await db
    .insert(opportunities)
    .values({ projectId: project.id, cluster: "meeting notes", status })
    .returning();
  return row.id;
}

it("starts a product only from the owner's Go opportunity, once", async () => {
  const id = await opportunity();
  const first = await service.create("a", { opportunityId: id });
  expect(first).toMatchObject({
    name: "meeting notes",
    status: "not_started",
    userId: "a",
  });
  expect(
    (await service.create("a", { opportunityId: id, name: "Other" })).id,
  ).toBe(first.id);
  await expect(
    service.create("b", { opportunityId: id }),
  ).rejects.toMatchObject({
    code: "OPPORTUNITY_NOT_FOUND",
  });
  const notGo = await opportunity("needs_validation");
  await expect(
    service.create("a", { opportunityId: notGo }),
  ).rejects.toMatchObject({
    code: "EXECUTION_NEEDS_GO",
  });
  expect((await service.list("a")).map((p) => p.id)).toEqual([first.id]);
  expect(await service.list("a", id)).toHaveLength(1);
  expect(await service.list("b")).toEqual([]);
});

it("updates the product; a launched product needs a launch date", async () => {
  const { id } = await service.create("a", {
    opportunityId: await opportunity(),
  });
  await expect(
    service.update("a", id, { status: "launched" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const updated = await service.update("a", id, {
    status: "launched",
    launchedOn: "2026-10-12",
    domain: "Notes.Example.com",
    repoUrl: "https://github.com/me/notes",
  });
  expect(updated).toMatchObject({
    status: "launched",
    launchedOn: "2026-10-12",
    domain: "notes.example.com",
  });
  await expect(
    service.update("a", id, { launchedOn: null }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    service.update("a", id, { repoUrl: "javascript:alert(1)" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(service.update("b", id, { name: "x" })).rejects.toMatchObject({
    code: "EXECUTION_PROJECT_NOT_FOUND",
  });
});

it("records visitors and revenue as manual, keeps unknown fees unknown", async () => {
  const { id } = await service.create("a", {
    opportunityId: await opportunity(),
  });
  await service.addEvent("a", id, {
    metric: "visitors",
    count: 300,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-07",
  });
  await service.addEvent("a", id, {
    metric: "activations",
    count: 12,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-07",
  });
  await expect(
    service.addEvent("a", id, {
      metric: "visitors",
      count: 1,
      periodStart: "2026-10-07",
      periodEnd: "2026-10-01",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await service.addRevenue("a", id, {
    occurredOn: "2026-10-05",
    currency: "USD",
    orders: 3,
    gross: 27,
    fees: 1.71,
    evidence: "ord_1",
  });
  await service.addRevenue("a", id, {
    occurredOn: "2026-10-06",
    currency: "USD",
    orders: 1,
    gross: 9,
    refund: 9,
  });
  // The client cannot claim a verified payment.
  await service.addRevenue("a", id, {
    occurredOn: "2026-10-06",
    currency: "EUR",
    orders: 1,
    gross: 9,
    fees: 0,
    source: "payment_verified",
  });
  await expect(
    service.addRevenue("a", id, {
      occurredOn: "2026-10-06",
      currency: "usd",
      orders: 1,
      gross: 9,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    service.addRevenue("a", id, {
      occurredOn: "2026-10-06",
      currency: "USD",
      orders: 1,
      gross: 9,
      refund: 10,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });

  const detail = toExecutionDetailDto(await service.get("a", id));
  expect(detail.totals).toEqual({
    visitors: 300,
    activations: 12,
    revenue: [
      {
        currency: "EUR",
        orders: 1,
        verifiedOrders: 0,
        gross: 9,
        refund: 0,
        fees: 0,
        net: 9,
      },
      {
        currency: "USD",
        orders: 4,
        verifiedOrders: 0,
        gross: 36,
        refund: 9,
        fees: null,
        net: null,
      },
    ],
  });
  expect(detail.revenue.every((r) => r.source === "manual")).toBe(true);
});

it("deletes only the owner's manual records", async () => {
  const { id } = await service.create("a", {
    opportunityId: await opportunity(),
  });
  const event = await service.addEvent("a", id, {
    metric: "visitors",
    count: 5,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-01",
  });
  const [verified] = await db
    .insert(revenueEvents)
    .values({
      projectId: id,
      occurredOn: "2026-10-01",
      currency: "USD",
      orders: 1,
      grossMinor: 900,
      source: "payment_verified",
    })
    .returning();
  await expect(
    service.remove("b", id, "events", event.id),
  ).rejects.toMatchObject({
    code: "EXECUTION_PROJECT_NOT_FOUND",
  });
  await service.remove("a", id, "events", event.id);
  await expect(
    service.remove("a", id, "events", event.id),
  ).rejects.toMatchObject({
    code: "EXECUTION_RECORD_NOT_FOUND",
  });
  await expect(
    service.remove("a", id, "revenue", verified.id),
  ).rejects.toMatchObject({
    code: "EXECUTION_RECORD_NOT_FOUND",
  });
  expect(
    toExecutionDetailDto(await service.get("a", id)).totals.revenue[0]
      .verifiedOrders,
  ).toBe(1);
});

it("keeps the product when the research project goes, and exports and erases it", async () => {
  const oppId = await opportunity();
  const { id } = await service.create("a", { opportunityId: oppId });
  await service.addRevenue("a", id, {
    occurredOn: "2026-10-05",
    currency: "USD",
    orders: 1,
    gross: 9,
  });
  await db.delete(researchProjects);
  expect((await service.get("a", id)).project.opportunityId).toBeNull();
  expect(await exportExecutionData(db, "a")).toMatchObject([
    {
      name: "meeting notes",
      revenue: [
        { currency: "USD", grossMinor: 900, feesMinor: null, source: "manual" },
      ],
    },
  ]);
  await eraseExecutionData(db, "a");
  expect(await service.list("a")).toEqual([]);
  await expect(service.get("a", randomUUID())).rejects.toMatchObject({
    code: "EXECUTION_PROJECT_NOT_FOUND",
  });
});
