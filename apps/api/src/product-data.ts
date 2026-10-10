import type { ProductData } from "@repo/admin/account-service";
import type { Database } from "@repo/db/client";
import {
  eraseResearchData,
  exportResearchData,
} from "@repo/research/user-data";
import { eraseTaskData, exportTaskData } from "@repo/tasks/user-data";

// The product's per-user data for account export and deletion. Like product.ts, one of the
// two places platform code reaches the feature; this one has no Hono types because the
// admin scripts (scripts/) import it.
export const productData = {
  export: async (database: Database, userId: string) => ({
    tasks: await exportTaskData(database, userId),
    researchProjects: await exportResearchData(database, userId),
  }),
  erase: async (database, userId) => {
    await eraseTaskData(database, userId);
    await eraseResearchData(database, userId);
  },
} satisfies ProductData;
