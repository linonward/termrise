import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createFakeStorage, writeFakeObject } from "./fake";

describe("createFakeStorage", () => {
  it("returns null metadata for a missing object", async () => {
    expect(await createFakeStorage().head("missing")).toBeNull();
  });

  it("stores objects uploaded through the signed URL contract", async () => {
    const storage = createFakeStorage();
    const { url, headers } = await storage.createUploadUrl({
      key: "uploads/u/a.png",
      contentType: "image/png",
      contentLength: 3,
      expiresInSeconds: 300,
    });
    expect(url).toContain("uploads/u/a.png");
    expect(headers["Content-Type"]).toBe("image/png");

    storage.simulateUpload("uploads/u/a.png", {
      contentType: "image/png",
      body: new Uint8Array(3),
    });
    expect(await storage.head("uploads/u/a.png")).toEqual({
      contentType: "image/png",
      contentLength: 3,
    });
  });

  it("deletes objects", async () => {
    const storage = createFakeStorage();
    storage.simulateUpload("k", {
      contentType: "image/png",
      body: new Uint8Array(1),
    });
    await storage.delete("k");
    expect(await storage.head("k")).toBeNull();
  });

  it("reads and writes object bodies", async () => {
    const storage = createFakeStorage();
    expect(await storage.getObject("inputs/u/a.jpg")).toBeNull();
    await storage.putObject("inputs/u/a.jpg", new Uint8Array([1, 2, 3]), {
      contentType: "image/jpeg",
    });
    expect(await storage.getObject("inputs/u/a.jpg")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(await storage.head("inputs/u/a.jpg")).toEqual({
      contentType: "image/jpeg",
      contentLength: 3,
    });
  });

  it("lists the keys under a prefix", async () => {
    const storage = createFakeStorage();
    for (const key of [
      "uploads/u/a.png",
      "uploads/u/b.png",
      "uploads/u2/c.png",
    ])
      storage.simulateUpload(key, {
        contentType: "image/png",
        body: new Uint8Array(1),
      });
    expect((await storage.list("uploads/u/")).sort()).toEqual([
      "uploads/u/a.png",
      "uploads/u/b.png",
    ]);
    expect(await storage.list("uploads/none/")).toEqual([]);
  });

  it("stores a streamed body", async () => {
    const storage = createFakeStorage();
    const stream = new Response(new Uint8Array([4, 5])).body!;
    await storage.putObject("videos/u/g.mp4", stream, {
      contentType: "video/mp4",
      contentLength: 2,
    });
    expect(await storage.getObject("videos/u/g.mp4")).toEqual(
      new Uint8Array([4, 5]),
    );
  });

  describe("with a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "fake-storage-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("shares objects with other processes through the directory", async () => {
      const storage = createFakeStorage({ dir });
      writeFakeObject(dir, "uploads/u/a.png", "image/png", new Uint8Array(3));
      expect(await storage.head("uploads/u/a.png")).toEqual({
        contentType: "image/png",
        contentLength: 3,
      });

      await storage.putObject(
        "videos/u/g.mp4",
        new Response(new Uint8Array([4, 5])).body!,
        {
          contentType: "video/mp4",
        },
      );
      const other = createFakeStorage({ dir });
      expect(await other.getObject("videos/u/g.mp4")).toEqual(
        new Uint8Array([4, 5]),
      );
      await other.delete("videos/u/g.mp4");
      expect(await storage.head("videos/u/g.mp4")).toBeNull();
    });

    it("lists objects written by other processes", async () => {
      const storage = createFakeStorage({ dir });
      writeFakeObject(dir, "uploads/v/a.png", "image/png", new Uint8Array(1));
      writeFakeObject(dir, "uploads/v/b.png", "image/png", new Uint8Array(1));
      writeFakeObject(dir, "uploads/w/c.png", "image/png", new Uint8Array(1));
      expect((await storage.list("uploads/v/")).sort()).toEqual([
        "uploads/v/a.png",
        "uploads/v/b.png",
      ]);
      expect(await storage.list("uploads/missing/")).toEqual([]);
    });
  });
});
