import type { Database } from "@repo/db/client";

import { eraseTaskData, exportTaskData } from "@/features/tasks/user-data";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// The product's per-user data for account export and deletion. Like server/product.ts,
// one of the two places platform code reaches the feature; this one has no
// "server-only" because the admin scripts import it.

export type ProductData = {
  /** Everything the user created in the product, for the export file. */
  export(database: Database, userId: string): Promise<Record<string, unknown>>;
  /** Erases the user's content; runs inside the deletion transaction. */
  erase(database: Database | Transaction, userId: string): Promise<void>;
};

export const productData = {
  export: async (database: Database, userId: string) => ({
    tasks: await exportTaskData(database, userId),
  }),
  erase: eraseTaskData,
} satisfies ProductData;
