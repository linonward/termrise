// Deletes a user's account on request (see docs/runbook.md).
// Run: DATABASE_URL=<connection string> R2_...=<...> pnpm admin:delete-user --user <userId> [--yes]
// Without --yes it only prints what would be deleted. A rerun is safe.
import { pathToFileURL } from "node:url";
import { parseArgs as parseNodeArgs } from "node:util";

import { createDb } from "@repo/db/client";

import {
  AccountError,
  createAccountService,
} from "@/server/account/account-service";
import { productData } from "@/server/product-data";

import { storageFromEnv } from "./script-storage";

const USAGE = "Usage: pnpm admin:delete-user --user <userId> [--yes]";

type Args = { userId: string; yes: boolean };

export function parseArgs(argv: string[]): Args {
  const { values } = parseNodeArgs({
    args: argv,
    options: { user: { type: "string" }, yes: { type: "boolean" } },
  });
  if (!values.user) throw new Error(USAGE);
  return { userId: values.user, yes: values.yes ?? false };
}

export async function deleteUser(
  service: ReturnType<typeof createAccountService>,
  args: Args,
) {
  const plan = await service.planDeletion(args.userId);
  if (!args.yes) return { preview: plan, deleted: false };
  try {
    return { ...(await service.deleteUser(args.userId)), deleted: true };
  } catch (error) {
    if (error instanceof AccountError && error.code === "ACTIVE_SUBSCRIPTION")
      throw new Error(
        `Subscription ${plan.activeSubscriptionId} can still charge the user: cancel it and wait until it is CANCELED, then run again`,
      );
    throw error;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const args = parseArgs(process.argv.slice(2));
  const target = new URL(url);
  console.log(`Database: ${target.host}${target.pathname}`);
  const database = createDb(url);
  try {
    const service = createAccountService(database, {
      storage: storageFromEnv(process.env),
      product: productData,
    });
    console.log(await deleteUser(service, args));
    if (!args.yes) console.log("Preview only. Add --yes to delete.");
  } finally {
    await database.pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main().catch((error: Error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  });
