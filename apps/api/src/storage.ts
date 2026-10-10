import { createFakeStorage } from "@repo/storage/adapters/fake";
import { createR2Storage } from "@repo/storage/adapters/r2";
import type { ObjectStorage } from "@repo/storage/types";

import type { ApiEnv } from "./env";

/** R2 through its S3 API; E2E signs fake URLs and keeps nothing (STORAGE_PROVIDER=fake). */
export function apiStorage(env: ApiEnv): ObjectStorage {
  return env.STORAGE_PROVIDER === "fake"
    ? createFakeStorage()
    : createR2Storage({
        accountId: env.R2_ACCOUNT_ID,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        bucket: env.R2_BUCKET,
        endpoint: env.R2_ENDPOINT,
      });
}
