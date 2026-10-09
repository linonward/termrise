// Manual credit adjustment through CreditService.adminAdjust (see docs/runbook.md).
// Run: DATABASE_URL=<connection string> pnpm admin:adjust --user <userId> --amount=<±n> --id <uuid> --reason "<text>"
// Write --amount=-5 with "=": a bare negative number is read as an option.
// The same --id is idempotent, so a rerun after a failure never adjusts twice.
import { pathToFileURL } from "node:url";
import { parseArgs as parseNodeArgs } from "node:util";

import { createCreditService } from "@repo/credits/credit-service";
import { createDb, type Database } from "@repo/db/client";

const USAGE =
  'Usage: pnpm admin:adjust --user <userId> --amount=<±n> --id <uuid> --reason "<text>"';

type Args = { userId: string; amount: number; id: string; reason: string };

export function parseArgs(argv: string[]): Args {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      user: { type: "string" },
      amount: { type: "string" },
      id: { type: "string" },
      reason: { type: "string" },
    },
  });
  const { user, amount, id, reason } = values;
  if (!user || !amount || !id || !reason) throw new Error(USAGE);
  if (!/^-?\d+$/.test(amount)) throw new Error("--amount must be an integer");
  return { userId: user, amount: Number(amount), id, reason };
}

export async function adminAdjust(database: Database, args: Args) {
  const credits = createCreditService(database);
  const entry = await credits.adminAdjust(
    args.userId,
    args.amount,
    args.id,
    args.reason,
  );
  return {
    transactionId: entry.id,
    balance: await credits.getBalance(args.userId),
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const args = parseArgs(process.argv.slice(2));
  const target = new URL(url);
  console.log(`Database: ${target.host}${target.pathname}`);
  const database = createDb(url);
  try {
    console.log(await adminAdjust(database, args));
  } finally {
    await database.pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main().catch((error: Error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  });
