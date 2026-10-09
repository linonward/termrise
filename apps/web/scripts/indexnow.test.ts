import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { INDEXNOW_KEY } from "./indexnow";

describe("key file", () => {
  it("public/<key>.txt contains the key", () => {
    const file = new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url);
    expect(readFileSync(file, "utf8").trim()).toBe(INDEXNOW_KEY);
  });
});
