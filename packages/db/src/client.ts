import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import * as schema from "./schema";

/** What services take: a pooled database (createDb) or one connection (connectDb). */
export type Database = NodePgDatabase<typeof schema>;

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

/**
 * One connection for one request, for apps/api on Cloudflare Workers: Hyperdrive keeps
 * the pool, and a Worker cannot share a connection between requests. Call close() at the end.
 */
export async function connectDb(connectionString: string) {
  const client = new Client({
    connectionString: withVerifyFullSsl(connectionString),
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  return Object.assign(drizzle({ client, schema, casing: "snake_case" }), {
    close: () => client.end(),
  });
}

let instance: ReturnType<typeof createDb> | undefined;

export function db(): ReturnType<typeof createDb> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  instance ??= createDb(url);
  return instance;
}
