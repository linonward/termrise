import type { Bindings } from "../env";

// What the Workers runtime passes to fetch(): bindings from wrangler.jsonc and secrets,
// and the execution context.
export const TEST_APP_URL = "http://localhost:3000";
export const TEST_API_URL = "http://localhost:3001";

export function testBindings(
  connectionString: string,
  overrides: Partial<Bindings> = {},
): Bindings {
  return {
    HYPERDRIVE: { connectionString },
    APP_URL: TEST_APP_URL,
    BETTER_AUTH_URL: TEST_API_URL,
    BETTER_AUTH_SECRET: "test-secret-for-integration-tests-only-123456789",
    GOOGLE_CLIENT_ID: "test-google-id",
    GOOGLE_CLIENT_SECRET: "test-google-secret",
    RESEND_API_KEY: "test-resend-key",
    EMAIL_FROM: "test@example.com",
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    R2_BUCKET: "test-bucket",
    ...overrides,
  };
}

export function testExecutionContext() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    passThroughOnException: () => {},
    props: {},
    /** Waits for the work passed to waitUntil(), such as closing the database connection. */
    settled: () => Promise.all(pending),
  };
}
