import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// DATABASE_URL from the environment, else from the web app's env file.
const envFile = "../../apps/web/.env.local";
if (!process.env.DATABASE_URL && existsSync(envFile))
  process.loadEnvFile(envFile);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
