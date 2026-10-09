import { defineConfig, devices } from "@playwright/test";

import { e2eEnv } from "./apps/web/tests/setup/e2e-env";

const port = 3100;

export default defineConfig({
  globalSetup: "./packages/db/src/testing/global-db.ts",
  testDir: "./apps/web/tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    // Analytics declined, so the cookie banner stays hidden (tests/e2e/analytics.spec.ts resets it).
    storageState: {
      cookies: [
        {
          name: "cookie_consent",
          value: "0",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm --filter web start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: e2eEnv,
  },
});
