import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// theme.css implements the token tables in docs/design/design-system.md
// (Color, Radius). This test keeps the two from drifting apart.
const doc = readFileSync("docs/design/design-system.md", "utf8");
const css = readFileSync("packages/ui/src/styles/theme.css", "utf8");

function section(heading: string) {
  const start = doc.indexOf(`### ${heading}\n`);
  const end = doc.indexOf("\n### ", start + 1);
  return doc.slice(start, end);
}

// Each `token` in the first cell (a `a` / `b` pair for status colours), with its
// light and dark values from the next two cells.
function colorTokens() {
  const tokens: { name: string; light: string; dark: string }[] = [];
  for (const line of section("Color").split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (!cells[1]?.startsWith("`") || !cells[2]?.startsWith("`#")) continue;
    const names = cells[1].match(/`([a-z-]+)`/g) ?? [];
    const lights = cells[2].match(/#[0-9A-Fa-f]+/g) ?? [];
    const darks = cells[3].match(/#[0-9A-Fa-f]+/g) ?? [];
    names.forEach((n, i) =>
      tokens.push({
        name: n.slice(1, -1),
        light: lights[i].toLowerCase(),
        dark: darks[i].toLowerCase(),
      }),
    );
  }
  return tokens;
}

function block(selector: string) {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("\n}", start));
}

function declared(body: string, name: string) {
  return body.match(new RegExp(`--${name}: (#[0-9a-f]+);`))?.[1];
}

describe("design tokens", () => {
  const tokens = colorTokens();

  it("reads every colour token from the design doc", () => {
    expect(tokens.map((t) => t.name)).toContain("background");
    expect(tokens).toHaveLength(24);
  });

  it("declares the light values in :root", () => {
    const root = block(":root");
    for (const t of tokens)
      expect(declared(root, t.name), t.name).toBe(t.light);
  });

  it("declares the dark values in .dark, or inherits identical ones", () => {
    const dark = block(".dark");
    for (const t of tokens)
      expect(declared(dark, t.name), t.name).toBe(
        t.dark === t.light ? undefined : t.dark,
      );
  });

  it("matches the radius scale", () => {
    for (const line of section("Radius").split("\n")) {
      const m = line.match(/`radius-(sm|md|lg)`\s*\|\s*(\d+)/);
      if (m) expect(css).toContain(`--radius-${m[1]}: ${m[2]}px;`);
    }
  });
});
