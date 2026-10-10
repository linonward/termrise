import { describe, expect, it } from "vitest";

import { isSafeCallback, safeNext } from "./auth-redirect";

describe("safeNext", () => {
  it("preserves an internal path and query", () => {
    expect(safeNext("/dashboard/generations?filter=failed")).toBe(
      "/dashboard/generations?filter=failed",
    );
  });
  // The login form's errorCallbackURL carries `next` percent-encoded in the query.
  it("keeps percent-encoded values inside the query", () => {
    const target = `/sign-in?next=${encodeURIComponent("/dashboard/generations?filter=failed")}&error=invalid_link`;
    expect(safeNext(target)).toBe(target);
  });
  it.each([
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2fevil.example",
    "/%255cevil.example",
    "/%2fevil.example?next=%2Fdashboard",
    // Dot segments that normalize to a protocol-relative URL.
    "/.//evil.example",
    "/..//evil.example",
    "/a/..//evil.example",
    "/%2e//evil.example",
    "/%2e%2e//evil.example",
    "/\nevil.example",
    "javascript:alert(1)",
    ["/dashboard"],
  ])("rejects unsafe targets: %s", (value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });
});

// apps/api serves Better Auth on its own origin, so callbacks to the web app are absolute.
describe("isSafeCallback", () => {
  const app = "http://localhost:3000";
  it("accepts safe relative paths", () => {
    expect(isSafeCallback("/dashboard?x=1")).toBe(true);
    expect(isSafeCallback("/dashboard", app)).toBe(true);
  });
  it("accepts safe absolute URLs on the app origin", () => {
    expect(isSafeCallback(`${app}/dashboard?x=1`, app)).toBe(true);
  });
  it.each([
    "https://evil.example/dashboard",
    `${app}@evil.example/`,
    `${app}.evil.example/`,
    `${app}//evil.example`,
    `${app}/\\evil.example`,
    app,
    "//evil.example",
    42,
  ])("rejects %s", (value) => {
    expect(isSafeCallback(value, app)).toBe(false);
  });
  it("rejects absolute URLs when no app origin is set", () => {
    expect(isSafeCallback(`${app}/dashboard`)).toBe(false);
  });
});
