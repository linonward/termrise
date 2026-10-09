import { expect, it } from "vitest";

import {
  AppError,
  ERROR_STATUS,
  type ErrorCode,
} from "@repo/observability/errors";

import { errorResponse } from "./respond";

it("answers every error code with its status and an English debug message", async () => {
  for (const code of Object.keys(ERROR_STATUS) as ErrorCode[]) {
    const response = errorResponse(new AppError(code));
    expect(response.status, code).toBe(ERROR_STATUS[code]);
    const { error } = await response.json();
    expect(error.code).toBe(code);
    expect(error.message, code).not.toBe(code);
  }
});

it("adds Retry-After to rate-limit errors", () => {
  const response = errorResponse(new AppError("RATE_LIMITED", "x", 42));
  expect(response.headers.get("Retry-After")).toBe("42");
});

it("hides unexpected errors behind INTERNAL_ERROR", async () => {
  const response = errorResponse(new Error("db password is hunter2"));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  });
});
