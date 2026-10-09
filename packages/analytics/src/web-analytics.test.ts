import { expect, it } from "vitest";

import { redactEvent, redactUrl } from "./web-analytics";

it("keeps the path and UTM parameters only", () => {
  expect(
    redactUrl(
      "https://example.com/blog/getting-started?utm_source=instagram&utm_medium=dm&fbclid=abc",
    ),
  ).toBe(
    "https://example.com/blog/getting-started?utm_source=instagram&utm_medium=dm",
  );
  expect(redactUrl("https://example.com/sign-up?next=%2Fpricing")).toBe(
    "https://example.com/sign-up",
  );
});

it("replaces ids in the path", () => {
  expect(
    redactUrl(
      "https://example.com/dashboard/tasks/91ab602f-35fc-419e-965d-746daf75af60?tab=x",
    ),
  ).toBe("https://example.com/dashboard/tasks/[id]");
});

it("redacts the url of an event and keeps the other fields", () => {
  expect(
    redactEvent({
      type: "vital",
      url: "https://example.com/dashboard?from=91ab602f-35fc-419e-965d-746daf75af60",
      route: "/dashboard",
    }),
  ).toEqual({
    type: "vital",
    url: "https://example.com/dashboard",
    route: "/dashboard",
  });
});
