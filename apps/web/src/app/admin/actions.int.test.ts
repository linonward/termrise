import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { createCreditService } from "@repo/credits/credit-service";
import { user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createAdminService } from "@/server/admin/admin-service";

import { adjustCredits, findUser } from "./actions";

// Server Actions are public POST endpoints: the /admin layout check does not
// protect them, so each action must check the admin session itself.
// getAdminSession returns null for signed-out visitors and for non-admin users.
const getAdminSession = vi.fn();
vi.mock("@/server/auth/auth", () => ({
  getAdminSession: () => getAdminSession(),
}));
vi.mock("@/server/admin/admin", () => ({
  getAdminService: () =>
    createAdminService(testDb(), { listTasks: async () => [] }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  await testDb()
    .insert(user)
    .values({ id: "u1", name: "U1", email: "shop@example.com" });
  await createCreditService(testDb()).grantSignupBonus("u1", 10);
});
afterAll(closeTestDb);

const adjustForm = (amount: string) => {
  const form = new FormData();
  form.set("userId", "u1");
  form.set("amount", amount);
  form.set("id", randomUUID());
  form.set("reason", "refund ticket 12");
  return form;
};
const balance = () => createCreditService(testDb()).getBalance("u1");

it("an admin adjusts the credits", async () => {
  getAdminSession.mockResolvedValue({ user: { id: "admin" } });
  const result = await adjustCredits({ status: "idle" }, adjustForm("5"));
  expect(result).toEqual({ status: "done", balance: 15 });
  expect(await balance()).toBe(15);
});

it("does not adjust the credits without an admin session", async () => {
  getAdminSession.mockResolvedValue(null);
  const result = await adjustCredits({ status: "idle" }, adjustForm("5"));
  expect(result).toMatchObject({ status: "error" });
  expect(await balance()).toBe(10);
});

it("an admin finds a user by email", async () => {
  getAdminSession.mockResolvedValue({ user: { id: "admin" } });
  const form = new FormData();
  form.set("query", "shop@example.com");
  await findUser({ notFound: false }, form);
  expect(redirect).toHaveBeenCalledWith("/admin/users/u1");
});

it("does not find users without an admin session", async () => {
  getAdminSession.mockResolvedValue(null);
  const form = new FormData();
  form.set("query", "shop@example.com");
  expect(await findUser({ notFound: false }, form)).toEqual({
    notFound: true,
  });
  expect(redirect).not.toHaveBeenCalled();
});
