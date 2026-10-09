import { expect, it } from "vitest";

import { consentFromCookies } from "./consent";

it("reads the cookie banner choice from a Cookie header", () => {
  expect(consentFromCookies("a=1; cookie_consent=1; b=2")).toBe(true);
  expect(consentFromCookies("cookie_consent=0")).toBe(false);
  expect(consentFromCookies("other=1")).toBeUndefined();
  expect(consentFromCookies(null)).toBeUndefined();
});
