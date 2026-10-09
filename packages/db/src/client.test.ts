import { describe, expect, it } from "vitest";

import { withVerifyFullSsl } from "./client";

const base = "postgresql://user:p%40ss@host-pooler.neon.tech/app";

describe("withVerifyFullSsl", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "rewrites sslmode=%s to verify-full",
    (mode) => {
      expect(
        withVerifyFullSsl(`${base}?sslmode=${mode}&channel_binding=require`),
      ).toBe(`${base}?sslmode=verify-full&channel_binding=require`);
      expect(
        withVerifyFullSsl(`${base}?channel_binding=require&sslmode=${mode}`),
      ).toBe(`${base}?channel_binding=require&sslmode=verify-full`);
    },
  );

  it("keeps other modes and URLs without sslmode", () => {
    for (const url of [
      `${base}?sslmode=verify-full`,
      `${base}?sslmode=disable`,
      `${base}?channel_binding=require`,
      "postgresql://postgres:postgres@localhost:54329/test",
    ]) {
      expect(withVerifyFullSsl(url)).toBe(url);
    }
  });

  it("keeps an explicit libpq compatibility opt-in", () => {
    const url = `${base}?uselibpqcompat=true&sslmode=require`;
    expect(withVerifyFullSsl(url)).toBe(url);
  });
});
