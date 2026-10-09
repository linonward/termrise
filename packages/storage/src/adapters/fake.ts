import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import type { ObjectMetadata, ObjectStorage } from "../types";

export interface FakeStorage extends ObjectStorage {
  /** Stand-in for the browser PUT to a signed URL. */
  simulateUpload(
    key: string,
    object: { contentType: string; body: Uint8Array },
  ): void;
}

interface Backend {
  read(key: string): (ObjectMetadata & { body: Uint8Array }) | null;
  write(key: string, contentType: string, body: Uint8Array): void;
  remove(key: string): void;
  keys(): string[];
}

function memoryBackend(): Backend {
  const objects = new Map<string, ObjectMetadata & { body: Uint8Array }>();
  return {
    read: (key) => objects.get(key) ?? null,
    write: (key, contentType, body) =>
      objects.set(key, { contentType, contentLength: body.byteLength, body }),
    remove: (key) => objects.delete(key),
    keys: () => [...objects.keys()],
  };
}

// E2E: the Next.js server and the Playwright process (which answers the
// browser's PUT / GET to the signed URLs) share objects through files.
export function writeFakeObject(
  dir: string,
  key: string,
  contentType: string,
  body: Uint8Array,
) {
  const path = join(dir, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  writeFileSync(`${path}.type`, contentType);
}

export function readFakeObject(dir: string, key: string) {
  const path = join(dir, key);
  if (!existsSync(path)) return null;
  const body = new Uint8Array(readFileSync(path));
  return {
    contentType: readFileSync(`${path}.type`, "utf8"),
    contentLength: statSync(path).size,
    body,
  };
}

function directoryBackend(dir: string): Backend {
  return {
    read: (key) => readFakeObject(dir, key),
    write: (key, contentType, body) =>
      writeFakeObject(dir, key, contentType, body),
    remove: (key) => {
      rmSync(join(dir, key), { force: true });
      rmSync(join(dir, `${key}.type`), { force: true });
    },
    keys: () =>
      existsSync(dir)
        ? readdirSync(dir, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile() && !entry.name.endsWith(".type"))
            .map((entry) =>
              relative(dir, join(entry.parentPath, entry.name))
                .split(sep)
                .join("/"),
            )
        : [],
  };
}

// For automated tests and E2E only (env.ts forbids it in production).
export function createFakeStorage({ dir }: { dir?: string } = {}): FakeStorage {
  const objects = dir ? directoryBackend(dir) : memoryBackend();

  return {
    async createUploadUrl({ key, contentType }) {
      return {
        url: `https://fake-storage.test/${key}`,
        headers: { "Content-Type": contentType },
      };
    },
    async createDownloadUrl({ key, downloadFilename }) {
      const url = new URL(`https://fake-storage.test/${key}`);
      if (downloadFilename) url.searchParams.set("download", downloadFilename);
      return url.toString();
    },
    async head(key) {
      const object = objects.read(key);
      return object
        ? {
            contentType: object.contentType,
            contentLength: object.contentLength,
          }
        : null;
    },
    async getObject(key) {
      return objects.read(key)?.body ?? null;
    },
    async putObject(key, body, { contentType }) {
      const bytes =
        body instanceof Uint8Array
          ? body
          : new Uint8Array(await new Response(body).arrayBuffer());
      objects.write(key, contentType, bytes);
    },
    async delete(key) {
      objects.remove(key);
    },
    async list(prefix) {
      return objects.keys().filter((key) => key.startsWith(prefix));
    },
    simulateUpload(key, { contentType, body }) {
      objects.write(key, contentType, body);
    },
  };
}
