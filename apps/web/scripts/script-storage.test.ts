import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, expect, it } from "vitest";

import { writeFakeObject } from "@repo/storage/adapters/fake";

import { storageFromEnv } from "./script-storage";

const dir = mkdtempSync(join(tmpdir(), "script-storage-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("uses the fake directory when STORAGE_PROVIDER=fake", async () => {
  writeFakeObject(dir, "uploads/u/a.png", "image/png", new Uint8Array(1));
  const storage = storageFromEnv({
    STORAGE_PROVIDER: "fake",
    FAKE_STORAGE_DIR: dir,
  });
  expect(await storage.list("uploads/u/")).toEqual(["uploads/u/a.png"]);
  expect(() => storageFromEnv({ STORAGE_PROVIDER: "fake" })).toThrow(
    "FAKE_STORAGE_DIR",
  );
});

it("requires the R2 variables otherwise", () => {
  expect(() => storageFromEnv({ R2_ACCOUNT_ID: "acc" })).toThrow(
    "R2_ACCESS_KEY_ID",
  );
  expect(() =>
    storageFromEnv({
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "id",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
    }),
  ).not.toThrow();
});
