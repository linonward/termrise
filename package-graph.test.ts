import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// The @repo dependency graph in packages/*/package.json
// (docs/architecture/overview.md#monorepo). ESLint lets a package import only
// what its package.json declares; this test keeps the declarations a DAG.
const names = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function repoDeps(name: string) {
  const pkg = JSON.parse(
    readFileSync(`packages/${name}/package.json`, "utf8"),
  ) as Record<string, Record<string, string> | undefined>;
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter((d) => d.startsWith("@repo/"))
    .map((d) => d.slice("@repo/".length));
}

describe("package graph", () => {
  it("only depends on other packages", () => {
    for (const name of names)
      for (const dep of repoDeps(name)) expect(names).toContain(dep);
  });

  it("has no cycle", () => {
    const done = new Set<string>();
    const visit = (name: string, path: string[]) => {
      if (path.includes(name))
        throw new Error(`Cycle: ${[...path, name].join(" → ")}`);
      if (done.has(name)) return;
      for (const dep of repoDeps(name)) visit(dep, [...path, name]);
      done.add(name);
    };
    for (const name of names) visit(name, []);
  });
});
