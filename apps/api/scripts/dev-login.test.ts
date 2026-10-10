import { expect, it } from "vitest";

import { assertLocal } from "./dev-login";

it("refuses any database but a local one", () => {
  expect(() =>
    assertLocal(
      "postgresql://postgres:postgres@localhost:54330/termrise_local",
    ),
  ).not.toThrow();
  expect(() =>
    assertLocal("postgresql://u:p@ep-x.us-east-2.aws.neon.tech/app"),
  ).toThrow("local database");
});
