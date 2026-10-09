import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { user, session, verification } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import {
  setErrorReporter,
  type ErrorReporter,
} from "@repo/observability/logger";

import { createAuth } from "./create-auth";
import { createAuthGuards } from "./guards";
import { LAST_LOGIN_METHOD_COOKIE } from "./last-login-method";

const baseURL = "http://localhost:3100";
const deliveries: string[] = [];
// What the app's onUserCreated hook receives: the new user and the sign-up request.
const created: { id: string; cookie: string | null }[] = [];
const auth = createAuth(
  testDb(),
  {
    appName: "Acme",
    baseURL,
    secret: "test-secret-for-integration-tests-only-123456789",
    googleClientId: "test-google-id",
    googleClientSecret: "test-google-secret",
  },
  async ({ url }) => {
    deliveries.push(url);
  },
  async (newUser, request) => {
    created.push({
      id: newUser.id,
      cookie: request?.headers.get("cookie") ?? null,
    });
  },
);
const guards = createAuthGuards(auth);
const request = (path: string, body?: object, cookie?: string) =>
  auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Origin: baseURL,
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
async function login() {
  const sent = await request("/sign-in/magic-link", {
    email: "auth-test@example.com",
    callbackURL: "/dashboard",
  });
  expect(sent.status).toBe(200);
  const verified = await auth.handler(new Request(deliveries.at(-1)!));
  expect(verified.status).toBe(302);
  const cookie = verified.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  return { verified, cookie };
}
beforeEach(async () => {
  await resetDb();
  deliveries.length = 0;
  created.length = 0;
});
afterAll(closeTestDb);

describe("authentication against PostgreSQL", () => {
  it("creates a verified user, session and single-use hashed magic link", async () => {
    const { verified, cookie } = await login();
    expect(verified.headers.get("location")).toBe(`${baseURL}/dashboard`);
    expect((await testDb().select().from(user))[0]).toMatchObject({
      emailVerified: true,
    });
    expect(await testDb().select().from(session)).toHaveLength(1);
    expect(await testDb().select().from(verification)).toHaveLength(0);
    expect(await guards.requireUser(new Headers({ cookie }))).toMatchObject({
      email: "auth-test@example.com",
    });
    const replay = await auth.handler(new Request(deliveries[0]));
    expect(replay.headers.get("location")).toContain("error=INVALID_TOKEN");
    expect(await testDb().select().from(user)).toHaveLength(1);
    expect(await testDb().select().from(session)).toHaveLength(1);
  });
  it("remembers the last login method in a cookie", async () => {
    const { cookie } = await login();
    expect(cookie).toContain(`${LAST_LOGIN_METHOD_COOKIE}=magic-link`);
  });
  it("calls onUserCreated once per new user, not on a later login", async () => {
    await login();
    await login();
    const [only] = await testDb().select().from(user);
    expect(created.map((c) => c.id)).toEqual([only.id]);
  });
  it("passes the sign-up request, with its cookies, to onUserCreated", async () => {
    await request("/sign-in/magic-link", {
      email: "cookie@example.com",
      callbackURL: "/dashboard",
    });
    // The link is opened in the browser that made the cookie banner choice.
    await auth.handler(
      new Request(deliveries.at(-1)!, {
        headers: { cookie: "cookie_consent=1" },
      }),
    );
    expect(created).toMatchObject([{ cookie: "cookie_consent=1" }]);
  });
  it("logs out and rejects a revoked or forged session", async () => {
    const { cookie } = await login();
    expect((await request("/sign-out", {}, cookie)).status).toBe(200);
    await expect(
      guards.requireUser(new Headers({ cookie })),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    await expect(
      guards.requireUser(
        new Headers({ cookie: "better-auth.session_token=forged" }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("refuses missing sessions", async () => {
    await expect(guards.requireUser(new Headers())).rejects.toMatchObject({
      status: 401,
    });
    const { cookie } = await login();
    expect((await guards.requireUser(new Headers({ cookie }))).email).toBe(
      "auth-test@example.com",
    );
  });
  it("rejects expired links and external callback redirects", async () => {
    await request("/sign-in/magic-link", {
      email: "auth-test@example.com",
      callbackURL: "/dashboard",
    });
    const token = new URL(deliveries[0]).searchParams.get("token")!;
    const stored = (await testDb().select().from(verification))[0];
    expect(stored.identifier).not.toContain(token);
    await testDb()
      .update(verification)
      .set({ expiresAt: new Date(0) })
      .where(eq(verification.id, stored.id));
    const expired = await auth.handler(new Request(deliveries[0]));
    expect(expired.headers.get("location")).toContain("error=");
    expect(await testDb().select().from(session)).toHaveLength(0);
    const external = await request("/sign-in/magic-link", {
      email: "auth-test@example.com",
      callbackURL: "https://evil.example",
    });
    expect(external.status).toBeGreaterThanOrEqual(400);
  });
  it("accepts the callback URLs the magic-link form sends", async () => {
    const next = "/dashboard/generations?filter=failed";
    const sent = await request("/sign-in/magic-link", {
      email: "auth-test@example.com",
      callbackURL: next,
      newUserCallbackURL: next,
      errorCallbackURL: `/sign-in?next=${encodeURIComponent(next)}&error=invalid_link`,
    });
    expect(sent.status).toBe(200);
    expect(deliveries).toHaveLength(1);
  });
  it("creates a Google authorization URL with the configured callback", async () => {
    const response = await request("/sign-in/social", {
      provider: "google",
      callbackURL: "/dashboard",
      disableRedirect: true,
    });
    expect(response.status).toBe(200);
    const { url } = await response.json();
    const target = new URL(url);
    expect(target.hostname).toBe("accounts.google.com");
    expect(target.searchParams.get("redirect_uri")).toBe(
      `${baseURL}/api/auth/callback/google`,
    );
    expect(target.searchParams.get("state")).toBeTruthy();
  });
  it("rejects One Tap callbacks with an unsafe callback URL or a bad token", async () => {
    const unsafe = await request("/one-tap/callback", {
      idToken: "not-a-token",
      callbackURL: "/\\evil.example",
    });
    expect(unsafe.status).toBe(400);
    expect((await unsafe.json()).message).toBe("Invalid callback URL");
    const forged = await request("/one-tap/callback", {
      idToken: "not-a-token",
      callbackURL: "/dashboard",
    });
    expect(forged.status).toBe(400);
    expect(await testDb().select().from(user)).toHaveLength(0);
    expect(await testDb().select().from(session)).toHaveLength(0);
  });
});

describe("unhandled errors", () => {
  it("reports them without the message and answers a plain 500", async () => {
    // A failed query lists its params, so the message can hold an email.
    const failing = createAuth(
      testDb(),
      {
        appName: "Acme",
        baseURL,
        secret: "test-secret-for-integration-tests-only-123456789",
        googleClientId: "test-google-id",
        googleClientSecret: "test-google-secret",
      },
      async () => {
        throw new Error("Failed query: insert\nparams: leak@example.com");
      },
    );
    const reporter = vi.fn<ErrorReporter>();
    setErrorReporter(reporter);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const response = await failing.handler(
        new Request(`${baseURL}/api/auth/sign-in/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: baseURL },
          body: JSON.stringify({ email: "leak@example.com" }),
        }),
      );
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("leak@example.com");
      expect(reporter).toHaveBeenCalledOnce();
      const [error, context] = reporter.mock.calls[0];
      expect(context.tags.eventType).toBe("auth.unhandled_error");
      expect(error.message).not.toContain("leak@example.com");
      expect(error.stack).not.toContain("leak@example.com");
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        "leak@example.com",
      );
    } finally {
      consoleError.mockRestore();
      setErrorReporter(() => {});
    }
  });
});
