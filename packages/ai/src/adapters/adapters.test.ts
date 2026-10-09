import { expect, it } from "vitest";

import { createExampleAiProvider } from "./example";
import { createFakeAiProvider, FAKE_AI_FAILURE } from "./fake";

it("example provider reverses the text", async () => {
  expect(await createExampleAiProvider().run("abc")).toEqual({ output: "cba" });
});

it("fake provider uppercases, and fails on the failure marker", async () => {
  const fake = createFakeAiProvider();
  expect(await fake.run("abc")).toEqual({ output: "ABC" });
  await expect(fake.run(`x ${FAKE_AI_FAILURE}`)).rejects.toThrow();
});
