import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@repo/observability/errors";
import type { ObjectStorage } from "@repo/storage/types";
import {
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  UPLOAD_TYPES,
} from "@repo/storage/upload-rules";

export { MAX_UPLOAD_BYTES };

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const input = z.object({
  contentType: z.string(),
  size: z.number(),
  extension: z.string(),
});
const allowedTypes = new Set<string>(Object.values(UPLOAD_TYPES));

export function createUploadService(
  storage: ObjectStorage,
  deps: { now?: () => Date; uuid?: () => string } = {},
) {
  const now = deps.now ?? (() => new Date());
  const uuid = deps.uuid ?? randomUUID;

  async function createUpload(userId: string, raw: unknown) {
    const parsed = input.safeParse(raw);
    if (
      !parsed.success ||
      !isAllowedUpload(
        parsed.data.contentType,
        parsed.data.extension,
        parsed.data.size,
      )
    )
      throw new AppError("INVALID_INPUT", "Unsupported upload");
    const { contentType, size, extension } = parsed.data;
    const objectKey = `uploads/${userId}/${uuid()}.${extension.toLowerCase()}`;
    const { url, headers } = await storage.createUploadUrl({
      key: objectKey,
      contentType,
      contentLength: size,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return {
      objectKey,
      uploadUrl: url,
      headers,
      expiresAt: new Date(
        now().getTime() + UPLOAD_URL_TTL_SECONDS * 1000,
      ).toISOString(),
    };
  }

  // Ownership by key prefix, then the actual object via HEAD (call it before debiting for a task that uses the upload).
  async function verifyUpload(userId: string, objectKey: string) {
    const owned = new RegExp(
      `^uploads/${userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$`,
    );
    if (!owned.test(objectKey))
      throw new AppError("UPLOAD_NOT_FOUND", "Upload not found");
    const metadata = await storage.head(objectKey);
    if (!metadata) throw new AppError("UPLOAD_NOT_FOUND", "Upload not found");
    if (
      !allowedTypes.has(metadata.contentType) ||
      metadata.contentLength <= 0 ||
      metadata.contentLength > MAX_UPLOAD_BYTES
    )
      throw new AppError("INVALID_INPUT", "Uploaded object is not allowed");
    return metadata;
  }

  return { createUpload, verifyUpload };
}
