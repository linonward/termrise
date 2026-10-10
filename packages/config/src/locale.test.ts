import { describe, expect, it } from "vitest";

import { localeFromHeaders, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("uses the cookie before Accept-Language", () =>
    expect(resolveLocale("en", "zh-CN")).toBe("en"));
  it("ignores an unsupported cookie value", () =>
    expect(resolveLocale("fr", "zh-CN")).toBe("zh"));
  it("picks the highest-quality supported language", () =>
    expect(resolveLocale(undefined, "fr, en;q=0.3, zh-CN;q=0.8")).toBe("zh"));
  it("skips languages with q=0", () =>
    expect(resolveLocale(undefined, "zh;q=0, en;q=0.5")).toBe("en"));
  it("defaults to English", () => {
    expect(resolveLocale(undefined, null)).toBe("en");
    expect(resolveLocale(undefined, "fr, de")).toBe("en");
  });
});

it("reads the locale from request headers", () => {
  expect(
    localeFromHeaders(
      new Headers({ cookie: "a=1; NEXT_LOCALE=zh", "accept-language": "en" }),
    ),
  ).toBe("zh");
  expect(localeFromHeaders(new Headers({ "accept-language": "zh-TW" }))).toBe(
    "zh",
  );
  expect(localeFromHeaders(new Headers())).toBe("en");
});
