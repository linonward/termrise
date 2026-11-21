import { expect, it } from "vitest";

import {
  templateForNewWord,
  templateForPoolKeyword,
  templateLine,
} from "./site-template";

it("builds evergreen keywords on tool-starter", () => {
  expect(templateForPoolKeyword()).toEqual({
    template: "tool-starter",
    reason: "pool_tool_rules",
  });
});

it("picks a new word's template from its direction, how it is built, then its class", () => {
  const w = (
    direction: string | null,
    buildAs: string | null,
    category: string | null,
  ) => templateForNewWord({ direction, buildAs, category }).template;
  expect(w("tool", "new_site", "ai")).toBe("tool-starter");
  expect(w("calculator", "inner_page", "tool")).toBe("tool-starter");
  for (const d of [
    "tutorial",
    "comparison",
    "alternatives",
    "templates",
    "collection",
  ])
    expect(w(d, "new_site", "ai")).toBe("web-starter");
  // Long tails are content pages, whatever the direction.
  expect(w("tool", "long_tail", "ai")).toBe("web-starter");
  expect(w(null, "new_site", "game")).toBe("web-starter");
  expect(w(null, "new_site", "ai")).toBe("tool-starter");
});

it("writes the template, the reason and the command", () => {
  const line = templateLine(
    templateForNewWord({
      direction: "tutorial",
      buildAs: "inner_page",
      category: "game",
    }),
  );
  expect(line).toContain("**web-starter**");
  expect(line).toContain("pnpm fleet:new <slug> --template web-starter");
  expect(line).toContain("vet-keyword");
});
