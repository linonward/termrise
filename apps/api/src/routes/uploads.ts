import { createUploadService } from "@repo/storage/upload-service";

import { apiEnv } from "../env";
import { readJson } from "../http";
import { rateLimit } from "../middleware/rate-limit";
import { apiStorage } from "../storage";
import { userRoutes } from "./user-routes";

// Signs a direct browser upload to R2 (docs/architecture/storage.md).
export const uploads = userRoutes().post("/", rateLimit("upload"), async (c) =>
  c.json(
    await createUploadService(apiStorage(apiEnv(c.env))).createUpload(
      c.var.user.id,
      await readJson(c),
    ),
  ),
);
