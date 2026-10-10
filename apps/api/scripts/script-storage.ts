import { createFakeStorage } from "@repo/storage/adapters/fake";
import { createR2Storage } from "@repo/storage/adapters/r2";
import type { ObjectStorage } from "@repo/storage/types";

// Object storage for admin scripts, from the same variables as the app (docs/architecture/environment.md).
export function storageFromEnv(
  env: Record<string, string | undefined>,
): ObjectStorage {
  if (env.STORAGE_PROVIDER === "fake") {
    if (!env.FAKE_STORAGE_DIR) throw new Error("FAKE_STORAGE_DIR is not set");
    return createFakeStorage({ dir: env.FAKE_STORAGE_DIR });
  }
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    env;
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  )
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be set",
    );
  return createR2Storage({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    endpoint: env.R2_ENDPOINT,
  });
}
