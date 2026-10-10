import { describe, expect, it } from "vitest";

import { EnvError, parseServerEnv } from "./env";

const valid = {
  APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_API_URL: "http://localhost:3001",
  GOOGLE_CLIENT_ID: "google-id",
  SENTRY_DSN: "https://public@sentry.example.com/1",
};

describe("parseServerEnv", () => {
  it("accepts a complete environment", () => {
    expect(parseServerEnv(valid).APP_URL).toBe("http://localhost:3000");
  });

  it("lists every missing variable by name", () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest.APP_URL;
    delete rest.NEXT_PUBLIC_API_URL;
    expect(() => parseServerEnv(rest)).toThrow(EnvError);
    expect(() => parseServerEnv(rest)).toThrow(
      /APP_URL[\s\S]*NEXT_PUBLIC_API_URL/,
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
        R2_ENDPOINT: "http://localhost:8333",
        VERCEL_ENV: "production",
      }),
    ).toThrow(/R2_ENDPOINT/);
  });

  it("treats empty values as unset, as .env.example leaves them", () => {
    const env = parseServerEnv({ ...valid, R2_ENDPOINT: "", VERCEL_ENV: "" });
    expect(env.R2_ENDPOINT).toBeUndefined();
    expect(env.VERCEL_ENV).toBeUndefined();
    expect(() => parseServerEnv({ ...valid, SENTRY_DSN: "" })).toThrow(
      /SENTRY_DSN/,
    );
  });
});
