import { resolveTestDatabaseUrl } from "@repo/db/testing/test-database";

export const E2E_API_PORT = 3101;
export const E2E_API_URL = `http://localhost:${E2E_API_PORT}`;
const E2E_AUTH_SECRET = "e2e-local-only-secret-not-a-real-credential-123456";

/** The test database; apps/api reads it through wrangler dev (playwright.config.ts). */
export const E2E_DATABASE_URL = resolveTestDatabaseUrl();

// The web app's variables (packages/config/src/env.ts): it only renders pages.
export const e2eEnv = {
  APP_URL: "http://localhost:3100",
  // apps/api under wrangler dev (playwright.config.ts). The browser bundle inlines it at
  // build time: build with NEXT_PUBLIC_API_URL=http://localhost:3101 (docs/architecture/testing.md).
  NEXT_PUBLIC_API_URL: E2E_API_URL,
  GOOGLE_CLIENT_ID: "e2e-google",
  SENTRY_DSN: "https://sentry.invalid/1",
};

// Bindings of apps/api under wrangler dev (passed with --var); same database and secret.
export const e2eApiVars = {
  APP_URL: e2eEnv.APP_URL,
  BETTER_AUTH_URL: E2E_API_URL,
  BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
  GOOGLE_CLIENT_ID: "e2e-google",
  GOOGLE_CLIENT_SECRET: "e2e-google",
  RESEND_API_KEY: "e2e-disabled",
  EMAIL_FROM: "test@example.com",
  TASK_PROVIDER: "fake",
  STORAGE_PROVIDER: "fake",
  PAYMENT_PROVIDER: "fake",
  R2_ACCOUNT_ID: "e2e-disabled",
  R2_ACCESS_KEY_ID: "e2e-disabled",
  R2_SECRET_ACCESS_KEY: "e2e-disabled",
  R2_BUCKET: "e2e-disabled",
  ALLOW_FAKE_PROVIDERS: "1",
  // tests/e2e/admin.spec.ts creates this user before signing in.
  ADMIN_USER_IDS: "e2e-admin",
};
