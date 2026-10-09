import { afterAll, beforeEach, expect, it } from "vitest";

import { rateLimits } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createAuth } from "./create-auth";
import { createMagicLinkLimiter } from "./magic-link-limit";
import { createRateLimitService } from "./rate-limit";

let now = new Date("2026-10-05T12:00:00Z");
const limit = createMagicLinkLimiter(
  createRateLimitService(testDb(), () => now),
);
const from = (ip: string) =>
  new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1` });
beforeEach(async () => {
  now = new Date("2026-10-05T12:00:00Z");
  await resetDb();
});
afterAll(closeTestDb);

async function status(email: string, headers = new Headers()) {
  return limit(email, headers).then(
    () => "ok",
    (error: { statusCode?: number; body?: { code?: string } }) =>
      `${error.statusCode} ${error.body?.code}`,
  );
}

it("limits one email to 3 links per 10 minutes, ignoring case", async () => {
  for (const email of ["a@example.com", "A@example.com ", "a@EXAMPLE.com"])
    expect(await status(email)).toBe("ok");
  expect(await status("a@example.com")).toBe("429 RATE_LIMITED");
  expect(await status("b@example.com")).toBe("ok");
  now = new Date("2026-10-05T12:10:00Z");
  expect(await status("a@example.com")).toBe("ok");
});

it("limits one IP to 10 links per hour", async () => {
  for (let i = 0; i < 10; i++)
    expect(await status(`u${i}@example.com`, from("203.0.113.7"))).toBe("ok");
  expect(await status("x@example.com", from("203.0.113.7"))).toBe(
    "429 RATE_LIMITED",
  );
  expect(await status("x@example.com", from("203.0.113.8"))).toBe("ok");
});

it("counts one IPv6 /64 as one IP", async () => {
  // Same /64 written in full, compressed, and different interface ids.
  for (let i = 0; i < 10; i++)
    expect(
      await status(
        `u${i}@example.com`,
        from(
          i % 2
            ? `2001:db8:0:1::${i.toString(16)}`
            : `2001:0db8:0000:0001:aaaa:bbbb:cccc:${i.toString(16)}`,
        ),
      ),
    ).toBe("ok");
  expect(await status("x@example.com", from("2001:db8:0:1:ffff::1"))).toBe(
    "429 RATE_LIMITED",
  );
  expect(await status("x@example.com", from("2001:db8:0:2::1"))).toBe("ok");
});

it("counts an IPv4-mapped IPv6 address as its IPv4 address", async () => {
  for (let i = 0; i < 10; i++)
    expect(await status(`u${i}@example.com`, from("203.0.113.7"))).toBe("ok");
  expect(await status("x@example.com", from("::ffff:203.0.113.7"))).toBe(
    "429 RATE_LIMITED",
  );
  expect(await status("x@example.com", from("::ffff:203.0.113.8"))).toBe("ok");
});

it("limits one IP to 20 links per day", async () => {
  for (let hour = 0; hour < 2; hour++) {
    now = new Date(Date.UTC(2026, 9, 5, 12 + hour));
    for (let i = 0; i < 10; i++)
      expect(
        await status(`u${hour}-${i}@example.com`, from("203.0.113.7")),
      ).toBe("ok");
  }
  now = new Date("2026-10-05T14:00:00Z");
  expect(await status("x@example.com", from("203.0.113.7"))).toBe(
    "429 RATE_LIMITED",
  );
  now = new Date("2026-10-06T00:00:00Z");
  expect(await status("x@example.com", from("203.0.113.7"))).toBe("ok");
});

it("stops all email links after 90 per day", async () => {
  for (let i = 0; i < 90; i++)
    expect(await status(`u${i}@example.com`)).toBe("ok");
  expect(await status("late@example.com")).toBe("429 MAGIC_LINK_DAILY_LIMIT");
  now = new Date("2026-10-06T00:00:00Z");
  expect(await status("late@example.com")).toBe("ok");
});

it("does not store email addresses in rate limit keys", async () => {
  await status("private@example.com");
  const keys = (await testDb().select().from(rateLimits)).map((r) => r.key);
  expect(keys.join()).not.toContain("private");
});

it("returns 429 from the sign-in endpoint before sending the email", async () => {
  const baseURL = "http://localhost:3100";
  let sent = 0;
  const auth = createAuth(
    testDb(),
    {
      appName: "Acme",
      baseURL,
      secret: "test-secret-for-integration-tests-only-123456789",
      googleClientId: "test-google-id",
      googleClientSecret: "test-google-secret",
    },
    async ({ email, request }) => {
      await limit(email, request?.headers ?? new Headers());
      sent++;
    },
  );
  const send = () =>
    auth.handler(
      new Request(`${baseURL}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: baseURL },
        body: JSON.stringify({ email: "a@example.com" }),
      }),
    );
  for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200);
  const blocked = await send();
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("Retry-After")).toBe("600");
  expect(await blocked.json()).toMatchObject({ code: "RATE_LIMITED" });
  expect(sent).toBe(3);
});
