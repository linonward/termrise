import { expect, it } from "vitest";

import { messages } from "./messages";

function leaves(value: unknown, path = ""): [string, unknown][] {
  if (typeof value !== "object" || value === null) return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key),
  );
}

it("has no empty messages", () => {
  for (const [key, value] of leaves(messages))
    expect(value, key).toEqual(expect.stringMatching(/\S/));
});

it("has no template placeholders or drafts", () => {
  for (const [key, value] of leaves(messages))
    // "草稿" is also the research project status: only a bracketed marker is a draft.
    expect(value, key).not.toMatch(/\[[A-Z_]{3,}\]|DRAFT|[（【[]草稿[）】\]]/);
});
