// Object storage port; R2 in production, fake (in-memory or directory) in tests and E2E.
// Rules for keys, sizes and expiry live in docs/architecture/storage.md.

export interface CreateUploadUrlInput {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
}

export interface UploadUrl {
  url: string;
  /** Headers the browser must send with the PUT; they are part of the signature. */
  headers: Record<string, string>;
}

export interface CreateDownloadUrlInput {
  key: string;
  expiresInSeconds: number;
  /** When set, the response is served as an attachment with this filename. */
  downloadFilename?: string;
  /**
   * Returns the same URL for this many seconds so the browser cache can hit;
   * the URL stays valid for at least expiresInSeconds after each return.
   */
  cacheSeconds?: number;
}

export interface ObjectMetadata {
  contentType: string;
  contentLength: number;
}

export interface PutObjectOptions {
  contentType: string;
  /** Required for streamed bodies (R2 rejects unsized stream uploads). */
  contentLength?: number;
  /** Stored with the object and returned on every GET. */
  cacheControl?: string;
}

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<UploadUrl>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  head(key: string): Promise<ObjectMetadata | null>;
  /** Whole object in memory; only for small objects such as input images. */
  getObject(key: string): Promise<Uint8Array | null>;
  /** A ReadableStream body is streamed, not buffered (large files). */
  putObject(
    key: string,
    body: Uint8Array | ReadableStream<Uint8Array>,
    options: PutObjectOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every key that starts with the prefix, e.g. a user's uploads before account deletion. */
  list(prefix: string): Promise<string[]>;
}
