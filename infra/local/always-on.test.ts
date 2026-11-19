import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Always On (docs/architecture/environment.md#always-on): the workbench runs on
// the maintainer's machine and must come back by itself after a reboot.
const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

function services(compose: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = compose.split(/^services:\n/m)[1]?.split(/^\S/m)[0] ?? "";
  for (const block of body.split(/^ {2}(?=[a-z-]+:\n)/m).filter(Boolean)) {
    const name = block.slice(0, block.indexOf(":"));
    out.set(name, block);
  }
  return out;
}

describe("always on", () => {
  it("restarts the shared database, Redis and storage with Docker", () => {
    const shared = services(read("docker-compose.yml"));
    for (const name of ["postgres", "redis", "storage"]) {
      expect(shared.get(name), name).toMatch(/restart: unless-stopped/);
    }
  });

  it("keeps the shared project name, so termrise_local stays in the same volume", () => {
    expect(read("docker-compose.yml")).toMatch(/^name: saas-starter$/m);
  });

  it("restarts web, API and Worker with Docker", () => {
    const local = read("infra/local/compose.yml");
    expect(local).toMatch(/x-app: &app[\s\S]*?restart: unless-stopped/);
    for (const name of ["web", "api", "worker"]) {
      expect(services(local).get(name), name).toMatch(/<<: \*app/);
    }
  });

  it("installs both agents from the main checkout only", () => {
    const install = read("infra/local/install-agents.sh");
    expect(install).toContain("com.termrise.watch watch.sh 600");
    expect(install).toContain("com.termrise.backup backup.sh 86400");
    expect(install).toContain("not a worktree");
  });
});
