import { expect, it } from "vitest";

import { messages } from "./messages";

function leaves(value: unknown, path = ""): [string, unknown][] {
  if (typeof value !== "object" || value === null) return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key),
  );
}

it("en.json and zh.json have the same keys", () => {
  const keys = (locale: keyof typeof messages) =>
    leaves(messages[locale])
      .map(([key]) => key)
      .sort();
  expect(keys("zh")).toEqual(keys("en"));
});

it("has no empty messages", () => {
  for (const locale of ["en", "zh"] as const)
    for (const [key, value] of leaves(messages[locale]))
      expect(value, `${locale}.${key}`).toEqual(expect.stringMatching(/\S/));
});

it("has no template placeholders or drafts", () => {
  for (const locale of ["en", "zh"] as const)
    for (const [key, value] of leaves(messages[locale]))
      expect(value, `${locale}.${key}`).not.toMatch(
        /\[[A-Z_]{3,}\]|DRAFT|草稿/,
      );
});
