import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ObjectStorage } from "../types";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Local S3-compatible server for development; defaults to the R2 endpoint. */
  endpoint?: string;
}

export function createR2Storage(config: R2Config): ObjectStorage {
  const clientConfig = {
    region: "auto",
    endpoint:
      config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  };
  const client = new S3Client(clientConfig);
  // The upload body is unknown when signing: without this the URL carries the CRC32 of an empty body.
  const uploadSigner = new S3Client({
    ...clientConfig,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const Bucket = config.bucket;

  return {
    async createUploadUrl({
      key,
      contentType,
      contentLength,
      expiresInSeconds,
    }) {
      const command = new PutObjectCommand({
        Bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      });
      const url = await getSignedUrl(uploadSigner, command, {
        expiresIn: expiresInSeconds,
        // Keep these as signed headers (not query params) so the upload must match them.
        signableHeaders: new Set(["content-type", "content-length"]),
      });
      return { url, headers: { "Content-Type": contentType } };
    },

    async createDownloadUrl({
      key,
      expiresInSeconds,
      downloadFilename,
      cacheSeconds,
    }) {
      const command = new GetObjectCommand({
        Bucket,
        Key: key,
        ResponseContentDisposition: downloadFilename
          ? `attachment; filename="${downloadFilename}"`
          : undefined,
      });
      if (!cacheSeconds)
        return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
      // Sign at the start of the window: every call in it gets the same URL.
      const windowMs = cacheSeconds * 1000;
      return getSignedUrl(client, command, {
        signingDate: new Date(Math.floor(Date.now() / windowMs) * windowMs),
        expiresIn: expiresInSeconds + cacheSeconds,
      });
    },

    async head(key) {
      try {
        const result = await client.send(
          new HeadObjectCommand({ Bucket, Key: key }),
        );
        return {
          contentType: result.ContentType ?? "application/octet-stream",
          contentLength: result.ContentLength ?? 0,
        };
      } catch (error) {
        if (error instanceof NotFound) return null;
        throw error;
      }
    },

    async getObject(key) {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket, Key: key }),
        );
        return result.Body ? await result.Body.transformToByteArray() : null;
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },

    async putObject(key, body, { contentType, contentLength, cacheControl }) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: contentLength,
          CacheControl: cacheControl,
          Body:
            body instanceof Uint8Array
              ? body
              : Readable.fromWeb(body as WebReadableStream<Uint8Array>),
        }),
      );
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async list(prefix) {
      const keys: string[] = [];
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix,
            ContinuationToken,
          }),
        );
        for (const object of page.Contents ?? [])
          if (object.Key) keys.push(object.Key);
        ContinuationToken = page.NextContinuationToken;
      } while (ContinuationToken);
      return keys;
    },
  };
}
