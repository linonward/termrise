import { expect, it, vi } from "vitest";

import { uploadImage, UploadImageError, type PutFile } from "./upload-client";

const file = (type: string, bytes: number, name = "photo.png") =>
  new File([new Uint8Array(bytes)], name, { type });
const signed = () =>
  Response.json({
    objectKey: "uploads/u/k.png",
    uploadUrl: "https://storage.test/put",
    headers: { "Content-Type": "image/png" },
  });

it("requests a signed URL, PUTs the file directly to storage and returns the key", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(signed());
  const put = vi.fn<PutFile>(async (_u, _h, _f, onProgress) => {
    onProgress(0.5);
    return true;
  });
  const onProgress = vi.fn();
  const image = file("image/png", 3);
  await expect(uploadImage(image, { fetcher, put, onProgress })).resolves.toBe(
    "uploads/u/k.png",
  );
  const [apiUrl, apiInit] = fetcher.mock.calls[0];
  expect(apiUrl).toBe("/api/uploads");
  expect(JSON.parse(apiInit!.body as string)).toEqual({
    contentType: "image/png",
    size: 3,
    extension: "png",
  });
  expect(put).toHaveBeenCalledWith(
    "https://storage.test/put",
    { "Content-Type": "image/png" },
    image,
    onProgress,
  );
  expect(onProgress.mock.calls).toEqual([[0.5], [1]]);
});

it("rejects unsupported files before calling the API", async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const bad of [
    file("image/gif", 3, "a.gif"),
    file("image/png", 10 * 1024 * 1024 + 1),
    file("image/png", 3, "noextension"),
  ])
    await expect(uploadImage(bad, { fetcher })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  expect(fetcher).not.toHaveBeenCalled();
});

it("surfaces API error codes, network failures and storage failures", async () => {
  const limited = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429 }),
    );
  await expect(
    uploadImage(file("image/png", 3), { fetcher: limited }),
  ).rejects.toEqual(new UploadImageError("RATE_LIMITED"));
  const offline = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new TypeError("offline"));
  await expect(
    uploadImage(file("image/png", 3), { fetcher: offline }),
  ).rejects.toEqual(new UploadImageError("NETWORK_ERROR"));
  await expect(
    uploadImage(file("image/png", 3), {
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(signed()),
      put: async () => false,
    }),
  ).rejects.toEqual(new UploadImageError("STORAGE_ERROR"));
});
