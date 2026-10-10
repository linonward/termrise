// Writes one user's data to a JSON file for a data access request (see docs/runbook.md).
// Run: DATABASE_URL=<connection string> R2_...=<...> pnpm admin:export-user --user <userId> --out <file>
// The file contains personal data: send it to the user, then delete it.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs as parseNodeArgs } from "node:util";

import { createAccountService } from "@repo/admin/account-service";
import { createDb } from "@repo/db/client";

import { storageFromEnv } from "./script-storage";
import { productData } from "../src/product-data";

const USAGE = "Usage: pnpm admin:export-user --user <userId> --out <file>";

type Args = { userId: string; out: string };

export function parseArgs(argv: string[]): Args {
  const { values } = parseNodeArgs({
    args: argv,
    options: { user: { type: "string" }, out: { type: "string" } },
  });
  if (!values.user || !values.out) throw new Error(USAGE);
  return { userId: values.user, out: values.out };
}

export async function exportUser(
  service: ReturnType<typeof createAccountService>,
  args: Args,
) {
  const data = await service.exportUser(args.userId);
  // "wx": never overwrite an earlier export.
  writeFileSync(args.out, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
  return { file: args.out, uploads: data.uploads.length };
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
    console.log(await exportUser(service, args));
  } finally {
    await database.pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main().catch((error: Error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  });
