import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { createCreditService } from "@repo/credits/credit-service";
import { user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";

const ADMIN_EMAIL = "admin@example.com";

let admin: string;
let member: string;
let call: ReturnType<typeof createTestClient>["call"];

beforeEach(async () => {
  await resetDb();
  // The admin's id is known only after sign-up: sign in once, then allow that id.
  const first = createTestClient();
  await first.signIn(ADMIN_EMAIL);
  const [row] = await testDb().select({ id: user.id }).from(user);
  const client = createTestClient({ ADMIN_USER_IDS: row.id });
  call = client.call;
  admin = await client.signIn(ADMIN_EMAIL);
  member = await client.signIn("member@example.com");
  await testDb()
    .insert(user)
    .values({ id: "u1", name: "U1", email: "shop@example.com" });
  await createCreditService(testDb()).grantSignupBonus("u1", 10);
});
afterAll(closeTestDb);

const post = (path: string, cookie: string, body: unknown) =>
  call(path, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const adjust = (cookie: string, amount: number, id = randomUUID()) =>
  post("/api/admin/users/u1/credits", cookie, {
    amount,
    id,
    reason: "refund ticket 12",
  });
const balance = () => createCreditService(testDb()).getBalance("u1");

it("answers 404 to a signed-in user who is not an admin", async () => {
  expect(
    (await call("/api/admin/session", { headers: { cookie: member } })).status,
  ).toBe(404);
  expect((await adjust(member, 5)).status).toBe(404);
  expect(await balance()).toBe(10);
  expect((await call("/api/admin/session")).status).toBe(401);
});

it("lets an admin find a user by email and read the overview", async () => {
  expect(
    (await call("/api/admin/session", { headers: { cookie: admin } })).status,
  ).toBe(204);
  const found = await post("/api/admin/users/search", admin, {
    query: "SHOP@example.com",
  });
  expect(await found.json()).toEqual({ id: "u1" });
  const missing = await post("/api/admin/users/search", admin, {
    query: "nobody@example.com",
  });
  expect(missing.status).toBe(404);

  const overview = await (
    await call("/api/admin/users/u1", { headers: { cookie: admin } })
  ).json();
  expect(overview).toMatchObject({
    user: { id: "u1", email: "shop@example.com", creditBalance: 10 },
    ledgerSum: 10,
    transactions: [{ type: "SIGNUP_BONUS", amount: 10 }],
    tasks: [],
    purchases: [],
  });
});

it("lets an admin adjust credits once per id", async () => {
  const id = randomUUID();
  const first = await adjust(admin, 5, id);
  expect(await first.json()).toMatchObject({ balance: 15 });
  await adjust(admin, 5, id);
  expect(await balance()).toBe(15);
  const tooBig = await adjust(admin, 1001);
  expect(tooBig.status).toBe(400);
  expect(await tooBig.json()).toEqual({ error: { code: "INVALID_AMOUNT" } });
  const overdrawn = await adjust(admin, -100);
  expect((await overdrawn.json()).error.code).toBe("INSUFFICIENT_CREDITS");
});
