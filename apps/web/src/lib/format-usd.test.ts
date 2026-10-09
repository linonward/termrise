import { expect, it } from "vitest";

import { formatUsd } from "./format-usd";

it("formats whole-dollar prices and table amounts", () => {
  expect(formatUsd(900)).toBe("$9");
  expect(formatUsd(3900)).toBe("$39");
  expect(formatUsd(1900, { cents: true })).toBe("$19.00");
});

it("shows cents when a price is not a whole dollar", () => {
  expect(formatUsd(590)).toBe("$5.90");
  expect(formatUsd(1990)).toBe("$19.90");
  expect(formatUsd(333)).toBe("$3.33");
});
