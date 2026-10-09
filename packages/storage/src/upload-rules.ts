// Shared by the browser and the server; rules from docs/architecture/storage.md#upload-flow.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const UPLOAD_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type UploadExtension = keyof typeof UPLOAD_TYPES;

export function isAllowedUpload(
  contentType: string,
  extension: string,
  size: number,
) {
  const ext = extension.toLowerCase();
  return (
    ext in UPLOAD_TYPES &&
    UPLOAD_TYPES[ext as UploadExtension] === contentType &&
    Number.isInteger(size) &&
    size > 0 &&
    size <= MAX_UPLOAD_BYTES
  );
}
