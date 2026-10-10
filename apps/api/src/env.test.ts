import { expect, it } from "vitest";

import { apiEnv, type Bindings } from "./env";
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

it("requires the DeepSeek settings for the DeepSeek provider", () => {
  const parse = (overrides: Partial<Bindings>) => () =>
    apiEnv(testBindings("postgresql://x", overrides));
  expect(parse({ TASK_PROVIDER: "deepseek" })).toThrow("DEEPSEEK_API_KEY");
  expect(
    parse({
      TASK_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "k",
      DEEPSEEK_MODEL: "m",
    }),
  ).not.toThrow();
});

it("accepts the fake provider only with ALLOW_FAKE_PROVIDERS", () => {
  const parse = (overrides: Partial<Bindings>) => () =>
    apiEnv(testBindings("postgresql://x", overrides));
  expect(parse({ TASK_PROVIDER: "fake" })).toThrow("ALLOW_FAKE_PROVIDERS");
  expect(parse({ STORAGE_PROVIDER: "fake" })).toThrow("STORAGE_PROVIDER");
  expect(parse({ PAYMENT_PROVIDER: "fake" })).toThrow("PAYMENT_PROVIDER");
  expect(
    parse({ TASK_PROVIDER: "fake", ALLOW_FAKE_PROVIDERS: "1" }),
  ).not.toThrow();
  expect(apiEnv(testBindings("postgresql://x")).TASK_PROVIDER).toBe("example");
});

it("requires the Waffo keys for the Waffo provider", () => {
  const parse = () =>
    apiEnv(testBindings("postgresql://x", { WAFFO_PRIVATE_KEY: "" }));
  expect(parse).toThrow("WAFFO_PRIVATE_KEY");
  expect(apiEnv(testBindings("postgresql://x")).WAFFO_ENVIRONMENT).toBe("test");
});
