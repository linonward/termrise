import { describe, expect, it } from "vitest";

import { safeNext } from "./auth-redirect";

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
