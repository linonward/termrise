import { NextRequest } from "next/server";
import { expect, it } from "vitest";

import { proxy } from "./proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });

it("redirects a visitor without a session cookie to sign-in, keeping the target", async () => {
  const response = await proxy(request("/billing?checkout=success"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    "http://localhost:3000/sign-in?next=%2Fbilling%3Fcheckout%3Dsuccess",
  );
});

// Optimistic check only: no database here. The (dashboard) layout validates the
// session; tests/e2e/dashboard.spec.ts covers a forged cookie end to end.
it("lets a request with a session cookie through without reading the database", async () => {
  const response = await proxy(
    request("/billing?checkout=success", "better-auth.session_token=any.value"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("location")).toBeNull();
});

it("sends a report-only CSP with a new nonce on every page", async () => {
  const first = await proxy(request("/pricing"));
  const second = await proxy(request("/pricing"));
  expect(first.status).toBe(200);
  const csp = first.headers.get("content-security-policy-report-only");
  const nonce = first.headers.get("x-middleware-request-x-nonce");
  expect(nonce).toBeTruthy();
  expect(csp).toContain(`'nonce-${nonce}'`);
  // Next.js reads the nonce for its own scripts from the request header.
  expect(
    first.headers.get(
      "x-middleware-request-content-security-policy-report-only",
    ),
  ).toBe(csp);
  expect(second.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
});

it("redirects a protected page without a session cookie", async () => {
  const response = await proxy(request("/dashboard"));
  expect(response.status).toBe(307);
});

it("does not require a session cookie on public pages", async () => {
  const response = await proxy(request("/sign-in"));
  expect(response.status).toBe(200);
});
