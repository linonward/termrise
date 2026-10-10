import { expect, it } from "vitest";

import { apiEnv } from "./env";
import { testBindings } from "./testing/worker";

it("parses the bindings and the optional settings", () => {
  const env = apiEnv(
    testBindings("postgresql://x", { AUTH_COOKIE_DOMAIN: "termrise.com" }),
  );
  expect(env.AUTH_COOKIE_DOMAIN).toBe("termrise.com");
  expect(env.POSTHOG_HOST).toBe("https://us.i.posthog.com");
});

it("names invalid bindings without their values", () => {
  const secret = "too-short-secret";
  const parse = () =>
    apiEnv(testBindings("postgresql://x", { BETTER_AUTH_SECRET: secret }));
  expect(parse).toThrow("BETTER_AUTH_SECRET");
  expect(parse).not.toThrow(secret);
});
