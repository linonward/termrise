import { describe, expect, it } from "vitest";

import { AppError } from "@repo/observability/errors";
import { createFakeStorage } from "@repo/storage/adapters/fake";

import { createUploadService, MAX_UPLOAD_BYTES } from "./upload-service";

const setup = () => {
  const storage = createFakeStorage();
  const uploads = createUploadService(storage, {
    now: () => new Date("2026-10-05T10:00:00Z"),
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  return { storage, uploads };
};
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (e) => (e instanceof AppError ? e.code : String(e)),
  );

describe("createUpload", () => {
  it("returns a 5-minute signed PUT URL for a key under the user's prefix", async () => {
    const { uploads } = setup();
    const result = await uploads.createUpload("user-1", {
      contentType: "image/png",
      size: 1024,
      extension: "PNG",
    });
    expect(result).toEqual({
      objectKey: "uploads/user-1/11111111-1111-4111-8111-111111111111.png",
      uploadUrl:
        "https://fake-storage.test/uploads/user-1/11111111-1111-4111-8111-111111111111.png",
      headers: { "Content-Type": "image/png" },
      expiresAt: "2026-10-05T10:05:00.000Z",
    });
  });

  it.each([
    [
      "unsupported type",
      { contentType: "image/gif", size: 1, extension: "gif" },
    ],
    [
      "type/extension mismatch",
      { contentType: "image/png", size: 1, extension: "jpg" },
    ],
    [
      "too large",
      {
        contentType: "image/jpeg",
        size: MAX_UPLOAD_BYTES + 1,
        extension: "jpg",
      },
    ],
    ["empty file", { contentType: "image/jpeg", size: 0, extension: "jpeg" }],
    ["missing fields", { contentType: "image/webp" }],
    ["not an object", "image.png"],
  ])("rejects %s", async (_, input) => {
    expect(await code(setup().uploads.createUpload("user-1", input))).toBe(
      "INVALID_INPUT",
    );
  });

  it("accepts every allowed type at the size limit", async () => {
    const { uploads } = setup();
    for (const [contentType, extension] of [
      ["image/jpeg", "jpg"],
      ["image/jpeg", "jpeg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
    ])
      await uploads.createUpload("u", {
        contentType,
        size: MAX_UPLOAD_BYTES,
        extension,
      });
  });
});

describe("verifyUpload", () => {
  const key = "uploads/user-1/11111111-1111-4111-8111-111111111111.png";
  const body = (bytes: number) => new Uint8Array(bytes);

  it("returns the stored metadata for the owner's valid object", async () => {
    const { storage, uploads } = setup();
    storage.simulateUpload(key, { contentType: "image/png", body: body(2048) });
    expect(await uploads.verifyUpload("user-1", key)).toEqual({
      contentType: "image/png",
      contentLength: 2048,
    });
  });

  it("hides other users' objects and malformed keys as UPLOAD_NOT_FOUND", async () => {
    const { storage, uploads } = setup();
    storage.simulateUpload(key, { contentType: "image/png", body: body(1) });
    for (const candidate of [
      key,
      "uploads/user-1/../user-2/x.png",
      "videos/user-2/x.mp4",
      "uploads/user-2",
    ])
      expect(await code(uploads.verifyUpload("user-2", candidate))).toBe(
        "UPLOAD_NOT_FOUND",
      );
  });

  it("rejects a missing object", async () => {
    expect(await code(setup().uploads.verifyUpload("user-1", key))).toBe(
      "UPLOAD_NOT_FOUND",
    );
  });

  it("rejects an object whose actual size or type is not allowed", async () => {
    const { storage, uploads } = setup();
    storage.simulateUpload(key, {
      contentType: "image/png",
      body: body(MAX_UPLOAD_BYTES + 1),
    });
    expect(await code(uploads.verifyUpload("user-1", key))).toBe(
      "INVALID_INPUT",
    );
    storage.simulateUpload(key, { contentType: "text/html", body: body(10) });
    expect(await code(uploads.verifyUpload("user-1", key))).toBe(
      "INVALID_INPUT",
    );
  });
});
