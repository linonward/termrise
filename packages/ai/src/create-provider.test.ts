import { expect, it } from "vitest";

import { createAiProvider } from "./create-provider";

it("creates the configured provider", () => {
  expect(createAiProvider({ provider: "example" }).name).toBe("example");
  expect(createAiProvider({ provider: "fake" }).name).toBe("fake");
  expect(
    createAiProvider({ provider: "deepseek", apiKey: "k", model: "m" }).name,
  ).toBe("deepseek");
});
