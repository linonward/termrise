import "server-only";
import { serverEnv } from "@repo/config/env";
import { createFakeStorage } from "@repo/storage/adapters/fake";
import { createR2Storage } from "@repo/storage/adapters/r2";
import type { ObjectStorage } from "@repo/storage/types";
import { createUploadService } from "@repo/storage/upload-service";

let instance: ObjectStorage | undefined;
export function getStorage(): ObjectStorage {
  if (!instance) {
    const env = serverEnv();
    // env.ts guarantees FAKE_STORAGE_DIR when STORAGE_PROVIDER=fake.
    instance =
      env.STORAGE_PROVIDER === "fake"
        ? createFakeStorage({ dir: env.FAKE_STORAGE_DIR! })
        : createR2Storage({
            accountId: env.R2_ACCOUNT_ID,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            bucket: env.R2_BUCKET,
            endpoint: env.R2_ENDPOINT,
          });
  }
  return instance;
}

export const getUploadService = () => createUploadService(getStorage());
