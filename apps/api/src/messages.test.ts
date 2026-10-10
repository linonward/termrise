import { expect, it } from "vitest";

import { messages } from "./messages";

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object"
      ? keys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

it("has the same keys in every locale", () => {
  expect(keys(messages.zh)).toEqual(keys(messages.en));
});
