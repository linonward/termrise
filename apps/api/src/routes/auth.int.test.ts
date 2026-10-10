import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { resolveTestDatabaseUrl } from "@repo/db/testing/test-database";

import { createApp } from "../app";
import {
  TEST_API_URL,
  TEST_APP_URL,
  testBindings,
  testExecutionContext,
} from "../testing/worker";

const emails: { subject: string; text: string }[] = [];
const emailTransport = vi.fn<typeof fetch>(async (_url, init) => {
  emails.push(JSON.parse(init!.body as string));
  return new Response("{}");
});
const app = createApp({ emailTransport });

async function call(path: string, init: RequestInit = {}) {
  const ctx = testExecutionContext();
  const response = await app.request(
    `${TEST_API_URL}${path}`,
    init,
    testBindings(resolveTestDatabaseUrl()),
    ctx,
  );
  await ctx.settled();
  return response;
}

function sendLink(callbackURL: string, headers: Record<string, string> = {}) {
  return call("/api/auth/sign-in/magic-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: TEST_APP_URL,
      ...headers,
    },
    body: JSON.stringify({ email: "api-auth@example.com", callbackURL }),
  });
}

beforeEach(async () => {
  await resetDb();
  emails.length = 0;
});
afterAll(closeTestDb);

it("answers the CORS preflight of the web app only", async () => {
  const preflight = (origin: string) =>
    call("/api/auth/sign-in/magic-link", {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
  const allowed = await preflight(TEST_APP_URL);
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(TEST_APP_URL);
  expect(allowed.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  const other = await preflight("https://evil.example");
  expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

it("signs in with a magic link and returns to the web app", async () => {
  const sent = await sendLink(`${TEST_APP_URL}/dashboard`, {
    "Accept-Language": "zh-CN",
  });
  expect(sent.status).toBe(200);
  expect(sent.headers.get("Access-Control-Allow-Origin")).toBe(TEST_APP_URL);
  expect(emails).toHaveLength(1);
  expect(emails[0].subject).toBe("你的 Termrise 登录链接");
  const link = emails[0].text.split("\n").at(-1)!;
  expect(link.startsWith(`${TEST_API_URL}/api/auth/magic-link/verify`)).toBe(
    true,
  );

  const verified = await call(link.slice(TEST_API_URL.length));
  expect(verified.status).toBe(302);
  expect(verified.headers.get("location")).toBe(`${TEST_APP_URL}/dashboard`);
  const cookie = verified.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

  const session = await call("/api/auth/get-session", { headers: { cookie } });
  expect((await session.json()).user.email).toBe("api-auth@example.com");
  expect(await testDb().select().from(user)).toHaveLength(1);
});

it("rejects a callback to another origin", async () => {
  expect((await sendLink("https://evil.example/dashboard")).status).toBe(400);
  expect(emails).toHaveLength(0);
});
