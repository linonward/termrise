import { describe, expect, it } from "vitest";

import { EnvError, parseServerEnv } from "./env";

const valid = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
  NEXT_PUBLIC_API_URL: "http://localhost:3001",
  GOOGLE_CLIENT_ID: "google-id",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "app-dev",
  TASK_PROVIDER: "fake",
  PAYMENT_PROVIDER: "fake",
  SENTRY_DSN: "https://public@sentry.example.com/1",
};

describe("parseServerEnv", () => {
  it("accepts a complete environment", () => {
    const env = parseServerEnv(valid);
    expect(env.TASK_PROVIDER).toBe("fake");
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("lists every missing variable by name", () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest.DATABASE_URL;
    delete rest.NEXT_PUBLIC_API_URL;
    expect(() => parseServerEnv(rest)).toThrow(EnvError);
    expect(() => parseServerEnv(rest)).toThrow(
      /DATABASE_URL[\s\S]*NEXT_PUBLIC_API_URL/,
    );
  });

  it("never includes variable values in the error message", () => {
    const leaked = { ...valid, APP_URL: "not-a-url-but-secret-ish" };
    expect(() => parseServerEnv(leaked)).toThrow(EnvError);
    try {
      parseServerEnv(leaked);
    } catch (error) {
      expect(String(error)).not.toContain("not-a-url-but-secret-ish");
    }
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() =>
      parseServerEnv({ ...valid, DATABASE_URL: "mysql://localhost/db" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("requires the DeepSeek key and model when TASK_PROVIDER=deepseek", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        TASK_PROVIDER: "deepseek",
        DEEPSEEK_MODEL: " ",
      }),
    ).toThrow(/DEEPSEEK_API_KEY[\s\S]*DEEPSEEK_MODEL/);
    const env = parseServerEnv({
      ...valid,
      TASK_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-test",
      DEEPSEEK_MODEL: "test-model",
    });
    expect(env.DEEPSEEK_MODEL).toBe("test-model");
  });

  it("uses the example task provider by default", () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest.TASK_PROVIDER;
    expect(parseServerEnv(rest).TASK_PROVIDER).toBe("example");
  });

  it("requires all Waffo credentials when PAYMENT_PROVIDER is waffo", () => {
    expect(() =>
      parseServerEnv({ ...valid, PAYMENT_PROVIDER: "waffo" }),
    ).toThrow(/WAFFO_MERCHANT_ID[\s\S]*WAFFO_PRIVATE_KEY[\s\S]*WAFFO_STORE_ID/);
  });

  it("preserves configured Waffo credentials for server consumers", () => {
    const credentials = {
      WAFFO_MERCHANT_ID: "MER_test",
      WAFFO_PRIVATE_KEY: "test-private-key-not-a-real-credential",
      WAFFO_STORE_ID: "STO_test",
    };
    expect(
      parseServerEnv({ ...valid, PAYMENT_PROVIDER: "waffo", ...credentials }),
    ).toMatchObject(credentials);
  });

  it.each(["WAFFO_MERCHANT_ID", "WAFFO_PRIVATE_KEY", "WAFFO_STORE_ID"])(
    "rejects missing or blank %s without disclosing the private key",
    (name) => {
      for (const value of [undefined, "", "   "]) {
        const input = {
          ...valid,
          PAYMENT_PROVIDER: "waffo",
          WAFFO_MERCHANT_ID: "MER_test",
          WAFFO_PRIVATE_KEY: "private-key-must-not-appear-in-errors",
          WAFFO_STORE_ID: "STO_test",
          [name]: value,
        };
        expect(() => parseServerEnv(input)).toThrow(new RegExp(name));
        try {
          parseServerEnv(input);
        } catch (error) {
          expect(String(error)).not.toContain(
            "private-key-must-not-appear-in-errors",
          );
        }
      }
    },
  );

  it("forbids fake providers in production", () => {
    expect(() =>
      parseServerEnv({ ...valid, VERCEL_ENV: "production" }),
    ).toThrow(/TASK_PROVIDER[\s\S]*PAYMENT_PROVIDER/);
  });

  it("defaults to R2 storage and needs a directory for fake storage", () => {
    expect(parseServerEnv(valid).STORAGE_PROVIDER).toBe("r2");
    expect(() =>
      parseServerEnv({ ...valid, STORAGE_PROVIDER: "fake" }),
    ).toThrow(/FAKE_STORAGE_DIR/);
    expect(
      parseServerEnv({
        ...valid,
        STORAGE_PROVIDER: "fake",
        FAKE_STORAGE_DIR: "/tmp/e2e",
      }).FAKE_STORAGE_DIR,
    ).toBe("/tmp/e2e");
  });

  it("forbids fake storage in production", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        TASK_PROVIDER: "example",
        PAYMENT_PROVIDER: "waffo",
        WAFFO_MERCHANT_ID: "m",
        WAFFO_PRIVATE_KEY: "k",
        WAFFO_STORE_ID: "s",
        STORAGE_PROVIDER: "fake",
        FAKE_STORAGE_DIR: "/tmp/e2e",
        VERCEL_ENV: "production",
      }),
    ).toThrow(/STORAGE_PROVIDER/);
  });

  it("accepts an optional local R2_ENDPOINT URL", () => {
    expect(parseServerEnv(valid).R2_ENDPOINT).toBeUndefined();
    expect(
      parseServerEnv({ ...valid, R2_ENDPOINT: "http://localhost:8333" })
        .R2_ENDPOINT,
    ).toBe("http://localhost:8333");
    expect(() =>
      parseServerEnv({ ...valid, R2_ENDPOINT: "localhost" }),
    ).toThrow(/R2_ENDPOINT/);
  });

  it("forbids R2_ENDPOINT in production", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        TASK_PROVIDER: "example",
        PAYMENT_PROVIDER: "waffo",
        WAFFO_MERCHANT_ID: "m",
        WAFFO_PRIVATE_KEY: "k",
        WAFFO_STORE_ID: "s",
        R2_ENDPOINT: "http://localhost:8333",
        VERCEL_ENV: "production",
      }),
    ).toThrow(/R2_ENDPOINT/);
  });

  it("reads ADMIN_USER_IDS as a trimmed list, empty by default", () => {
    expect(parseServerEnv(valid).ADMIN_USER_IDS).toEqual([]);
    expect(
      parseServerEnv({ ...valid, ADMIN_USER_IDS: " a1 ,, b2 " }).ADMIN_USER_IDS,
    ).toEqual(["a1", "b2"]);
  });

  it("treats empty values as unset, as .env.example leaves them", () => {
    const env = parseServerEnv({
      ...valid,
      NEXT_PUBLIC_POSTHOG_KEY: "",
      NEXT_PUBLIC_POSTHOG_HOST: "",
      VERCEL_ENV: "",
    });
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://us.i.posthog.com");
    expect(env.VERCEL_ENV).toBeUndefined();
    expect(() => parseServerEnv({ ...valid, SENTRY_DSN: "" })).toThrow(
      /SENTRY_DSN/,
    );
  });

  // A production build without VERCEL_ENV: self-hosted, or `next start` locally.
  it("forbids fake providers in any production build by default", () => {
    expect(() => parseServerEnv({ ...valid, NODE_ENV: "production" })).toThrow(
      /TASK_PROVIDER[\s\S]*PAYMENT_PROVIDER/,
    );
    expect(() =>
      parseServerEnv({
        ...valid,
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toThrow(/PAYMENT_PROVIDER/);
  });

  it("allows fake providers in a production build only with ALLOW_FAKE_PROVIDERS=1", () => {
    for (const VERCEL_ENV of [undefined, "preview"])
      expect(
        parseServerEnv({
          ...valid,
          NODE_ENV: "production",
          VERCEL_ENV,
          ALLOW_FAKE_PROVIDERS: "1",
        }).PAYMENT_PROVIDER,
      ).toBe("fake");
    expect(() =>
      parseServerEnv({
        ...valid,
        NODE_ENV: "production",
        ALLOW_FAKE_PROVIDERS: "true",
      }),
    ).toThrow(/ALLOW_FAKE_PROVIDERS/);
  });

  it("never allows fake providers in Vercel production", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        VERCEL_ENV: "production",
        ALLOW_FAKE_PROVIDERS: "1",
      }),
    ).toThrow(/PAYMENT_PROVIDER/);
  });

  it("allows fake providers in development and tests", () => {
    for (const NODE_ENV of ["development", "test"])
      expect(parseServerEnv({ ...valid, NODE_ENV }).PAYMENT_PROVIDER).toBe(
        "fake",
      );
  });
});
