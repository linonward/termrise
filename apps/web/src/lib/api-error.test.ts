import { expect, it } from "vitest";

import { ERROR_STATUS } from "@repo/observability/errors";

import { messages } from "@/i18n/messages";

import { API_ERROR_CODES, errorCodeOf } from "./api-error";

it("covers every server error code", () => {
  expect([...API_ERROR_CODES].sort()).toEqual(Object.keys(ERROR_STATUS).sort());
});

it("has an en and zh message for every code, including network errors", () => {
  for (const locale of ["en", "zh"] as const)
    for (const code of [...API_ERROR_CODES, "NETWORK_ERROR"])
      expect(
        (messages[locale].errors as Record<string, string>)[code],
        `${locale}.errors.${code}`,
      ).toEqual(expect.stringMatching(/\S/));
});

it("maps responses to error codes", () => {
  const res = (status: number) => new Response(null, { status });
  expect(errorCodeOf(null, null)).toBe("NETWORK_ERROR");
  expect(
    errorCodeOf(res(429), { error: { code: "RATE_LIMITED", message: "x" } }),
  ).toBe("RATE_LIMITED");
  expect(errorCodeOf(res(500), null)).toBe("INTERNAL_ERROR");
  expect(errorCodeOf(res(418), { error: { code: "TEAPOT" } })).toBe(
    "INTERNAL_ERROR",
  );
});
