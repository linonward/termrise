import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createFakeStorage } from "@repo/storage/adapters/fake";

import { createAccountService } from "@/server/account/account-service";
import { productData } from "@/server/product-data";

import * as deleteScript from "./admin-delete-user";
import * as exportScript from "./admin-export-user";

const db = testDb();
const dir = mkdtempSync(join(tmpdir(), "admin-account-"));
const service = createAccountService(db, {
  storage: createFakeStorage(),
  product: productData,
});
beforeEach(async () => {
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await closeTestDb();
});

it("parses the flags", () => {
  expect(exportScript.parseArgs(["--user", "a", "--out", "a.json"])).toEqual({
    userId: "a",
    out: "a.json",
  });
  expect(() => exportScript.parseArgs(["--user", "a"])).toThrow(
    "Usage: pnpm admin:export-user",
  );
  expect(deleteScript.parseArgs(["--user", "a"])).toEqual({
    userId: "a",
    yes: false,
  });
  expect(deleteScript.parseArgs(["--user", "a", "--yes"])).toEqual({
    userId: "a",
    yes: true,
  });
  expect(() => deleteScript.parseArgs([])).toThrow(
    "Usage: pnpm admin:delete-user",
  );
});

it("writes the export once and never overwrites it", async () => {
  const out = join(dir, "a.json");
  expect(await exportScript.exportUser(service, { userId: "a", out })).toEqual({
    file: out,
    uploads: 0,
  });
  expect(JSON.parse(readFileSync(out, "utf8")).user.email).toBe(
    "a@example.com",
  );
  await expect(
    exportScript.exportUser(service, { userId: "a", out }),
  ).rejects.toThrow("EEXIST");
});

it("only previews without --yes", async () => {
  const preview = await deleteScript.deleteUser(service, {
    userId: "a",
    yes: false,
  });
  expect(preview).toMatchObject({ deleted: false, preview: { userId: "a" } });
  const [kept] = await db.select().from(user).where(eq(user.id, "a"));
  expect(kept!.email).toBe("a@example.com");

  expect(
    await deleteScript.deleteUser(service, { userId: "a", yes: true }),
  ).toEqual({ deleted: true, alreadyDeleted: false, uploadsDeleted: 0 });
  const [deleted] = await db.select().from(user).where(eq(user.id, "a"));
  expect(deleted!.email).toBe("deleted-a@deleted.invalid");
});
