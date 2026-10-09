import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

// The Neon integration injects sslmode=require. pg 8 treats it as verify-full
// but warns on every cold start; pg 9 will weaken it to libpq semantics.
export function withVerifyFullSsl(connectionString: string): string {
  if (/[?&]uselibpqcompat=true(&|$)/.test(connectionString)) {
    return connectionString;
  }
  return connectionString.replace(
    /([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/,
    "$1verify-full",
  );
}

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString: withVerifyFullSsl(connectionString),
  });
  return Object.assign(
    drizzle({ client: pool, schema, casing: "snake_case" }),
    { pool },
  );
}

let instance: Database | undefined;

export function db(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  instance ??= createDb(url);
  return instance;
}
