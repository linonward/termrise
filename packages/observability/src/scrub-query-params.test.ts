import { DrizzleQueryError } from "drizzle-orm/errors";
import { expect, it } from "vitest";

import { scrubSentryEvent, stripQueryParams } from "./scrub-query-params";

const failed = () =>
  new DrizzleQueryError(
    'insert into "user" ("email", "name") values ($1, $2)',
    ["private@example.com", "a prompt\nwith lines"],
    new Error("duplicate key"),
  );

it("keeps the SQL text and removes parameter values from message and stack", () => {
  const error = failed();
  expect(stripQueryParams(error.message)).toBe(
    'Failed query: insert into "user" ("email", "name") values ($1, $2)',
  );
  const stack = stripQueryParams(error.stack!);
  expect(stack).not.toContain("private@example.com");
  expect(stack).not.toContain("with lines");
  expect(stack).toMatch(/\n {4}at /);
});

it("leaves other messages unchanged", () => {
  expect(stripQueryParams("Magic link delivery failed")).toBe(
    "Magic link delivery failed",
  );
});

it("removes parameter values from Sentry exception values", () => {
  const event = {
    exception: { values: [{ type: "Error", value: failed().message }] },
  };
  expect(scrubSentryEvent(event).exception?.values?.[0].value).toBe(
    'Failed query: insert into "user" ("email", "name") values ($1, $2)',
  );
});
