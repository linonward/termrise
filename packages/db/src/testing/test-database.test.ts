import { describe, expect, it } from "vitest";

import { assertLocalTestDatabase } from "./test-database";

describe("assertLocalTestDatabase", () => {
  it("accepts a local database", () => {
    expect(() =>
      assertLocalTestDatabase(
        "postgresql://postgres:postgres@localhost:54329/app_test_db",
      ),
    ).not.toThrow();
  });

  it("rejects a remote Neon host", () => {
    expect(() =>
      assertLocalTestDatabase(
        "postgresql://owner:secret@ep-x-pooler.c-14.us-east-1.aws.neon.tech/app",
      ),
    ).toThrow(/local Docker or CI/);
  });

  it("rejects unsafe database names", () => {
    expect(() =>
      assertLocalTestDatabase(
        'postgresql://postgres:postgres@localhost:54329/x";drop',
      ),
    ).toThrow(/database name/);
  });
});
