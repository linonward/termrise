import { resolve } from "node:path";

import { resolveTestDatabaseUrl } from "@repo/db/testing/test-database";

export const e2eEnv = {
  DATABASE_URL: resolveTestDatabaseUrl(),
  APP_URL: "http://localhost:3100",
  BETTER_AUTH_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: "e2e-local-only-secret-not-a-real-credential-123456",
  GOOGLE_CLIENT_ID: "e2e-google",
  GOOGLE_CLIENT_SECRET: "e2e-google",
  RESEND_API_KEY: "e2e-disabled",
  EMAIL_FROM: "test@example.com",
  R2_ACCOUNT_ID: "e2e-disabled",
  R2_ACCESS_KEY_ID: "e2e-disabled",
  R2_SECRET_ACCESS_KEY: "e2e-disabled",
  R2_BUCKET: "e2e-disabled",
  STORAGE_PROVIDER: "fake",
  FAKE_STORAGE_DIR: resolve(".e2e-storage"),
  TASK_PROVIDER: "fake",
  PAYMENT_PROVIDER: "fake",
  // `next start` is a production build: fake providers need this flag.
  ALLOW_FAKE_PROVIDERS: "1",
  SENTRY_DSN: "https://sentry.invalid/1",
  // CI inlines a PostHog key for the browser (intercepted in analytics.spec.ts);
  // empty here so the server drops its events instead of sending them to PostHog.
  NEXT_PUBLIC_POSTHOG_KEY: "",
  // tests/e2e/admin.spec.ts creates this user before signing in.
  ADMIN_USER_IDS: "e2e-admin",
};
