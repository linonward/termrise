import { expect, it } from "vitest";

import { isStale } from "./new-word-sorts";

it("marks decisions and words waiting for a deep check with old numbers as stale", () => {
  const now = Date.parse("2026-11-21T00:00:00Z");
  const old = "2026-11-17T00:00:00Z";
  const fresh = "2026-11-20T00:00:00Z";
  expect(isStale({ verdict: "worth", ratio: 0.2, checkedAt: old }, now)).toBe(
    true,
  );
  expect(isStale({ verdict: "try", ratio: 0.01, checkedAt: fresh }, now)).toBe(
    false,
  );
  expect(isStale({ verdict: null, ratio: 0.05, checkedAt: old }, now)).toBe(
    true,
  );
  // Skipped and unmeasured words are not decisions.
  expect(isStale({ verdict: "skip", ratio: 0, checkedAt: old }, now)).toBe(
    false,
  );
  expect(isStale({ verdict: null, ratio: null, checkedAt: old }, now)).toBe(
    false,
  );
});
