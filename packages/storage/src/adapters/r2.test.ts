import { describe, expect, it, vi } from "vitest";

import { createR2Storage } from "./r2";

const storage = createR2Storage({
  accountId: "acc123",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret",
  bucket: "app-dev",
});

const params = (url: string) => new URL(url).searchParams;

describe("createR2Storage presigned URLs (offline)", () => {
  it("signs a PUT that locks content type and length", async () => {
    const { url, headers } = await storage.createUploadUrl({
      key: "uploads/user_1/abc.png",
      contentType: "image/png",
      contentLength: 1234,
      expiresInSeconds: 300,
    });
    const parsed = new URL(url);
    expect(parsed.host).toBe("acc123.r2.cloudflarestorage.com");
    expect(parsed.pathname).toBe("/app-dev/uploads/user_1/abc.png");
    expect(params(url).get("X-Amz-Expires")).toBe("300");
    const signed = params(url).get("X-Amz-SignedHeaders")?.split(";") ?? [];
    expect(signed).toEqual(
      expect.arrayContaining(["content-type", "content-length"]),
    );
    expect(headers).toEqual({ "Content-Type": "image/png" });
    // The SDK would sign the CRC32 of an empty body; servers that check it reject the upload.
    expect(
      [...params(url).keys()].filter((name) => /checksum/i.test(name)),
    ).toEqual([]);
  });

  it("signs an inline GET by default", async () => {
    const url = await storage.createDownloadUrl({
      key: "videos/user_1/gen.mp4",
      expiresInSeconds: 3600,
    });
    expect(params(url).get("X-Amz-Expires")).toBe("3600");
    expect(params(url).get("response-content-disposition")).toBeNull();
  });

  it("reuses one URL within the cache window and keeps the full lifetime", async () => {
    vi.useFakeTimers();
    try {
      const sign = () =>
        storage.createDownloadUrl({
          key: "thumbs/user_1/gen.webp",
          expiresInSeconds: 3600,
          cacheSeconds: 1800,
        });
      vi.setSystemTime(new Date("2026-10-06T10:30:05Z"));
      const first = await sign();
      vi.setSystemTime(new Date("2026-10-06T10:59:59Z"));
      expect(await sign()).toBe(first);
      expect(params(first).get("X-Amz-Date")).toBe("20261006T103000Z");
      // Signed at 10:30, valid until 12:00: at least one hour from any reuse.
      expect(params(first).get("X-Amz-Expires")).toBe("5400");
      vi.setSystemTime(new Date("2026-10-06T11:00:00Z"));
      expect(await sign()).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("signs against a local S3-compatible endpoint when one is set", async () => {
    const local = createR2Storage({
      accountId: "acc123",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      bucket: "app-dev",
      endpoint: "http://localhost:8333",
    });
    const { url } = await local.createUploadUrl({
      key: "uploads/user_1/abc.png",
      contentType: "image/png",
      contentLength: 1234,
      expiresInSeconds: 300,
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe("http://localhost:8333");
    expect(parsed.pathname).toBe("/app-dev/uploads/user_1/abc.png");
  });

  it("signs an attachment GET with a download filename", async () => {
    const url = await storage.createDownloadUrl({
      key: "videos/user_1/gen.mp4",
      expiresInSeconds: 3600,
      downloadFilename: "video-ab12.mp4",
    });
    expect(params(url).get("response-content-disposition")).toBe(
      'attachment; filename="video-ab12.mp4"',
    );
  });
});
