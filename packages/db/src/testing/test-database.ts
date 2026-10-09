import { existsSync } from "node:fs";

// apps/web/.env.local, whether the runner starts in the repo root or in a package.
// No import.meta: Playwright loads this file as CommonJS.
const ENV_FILE = [
  "apps/web/.env.local",
  "../../apps/web/.env.local",
  ".env.local",
].find(existsSync);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

/** Tests truncate tables, so they must never reach a remote (Neon) database. */
export function assertLocalTestDatabase(url: string): URL {
  const parsed = new URL(url);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `TEST_DATABASE_URL must point at local Docker or CI PostgreSQL, got host "${parsed.hostname}"`,
    );
  }
  const name = parsed.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Test database name must match [a-z0-9_]+, got "${name}"`);
  }
  return parsed;
}

export function resolveTestDatabaseUrl(): string {
  if (!process.env.TEST_DATABASE_URL && ENV_FILE) {
    process.loadEnvFile(ENV_FILE);
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start Docker PostgreSQL (docker compose up -d postgres) and set it in .env.local",
    );
  }
  assertLocalTestDatabase(url);
  return url;
}
