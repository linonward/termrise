import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

import { CLIENT_NAMESPACES, pickClientMessages } from "./client-messages";
import { messages } from "./messages";

const src = path.resolve(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [full] : [];
  });
}

it("lists every namespace that a client component translates", () => {
  const used = new Set<string>();
  for (const file of files(src)) {
    const code = readFileSync(file, "utf8");
    if (!code.startsWith('"use client"')) continue;
    // A client component reads messages only through useTranslations("namespace").
    expect(code, file).not.toMatch(/useMessages\(|useTranslations\(\s*\)/);
    for (const [, key] of code.matchAll(/useTranslations\("([^"]+)"\)/g))
      used.add(key.split(".")[0]);
  }
  expect([...used].sort()).toEqual([...CLIENT_NAMESPACES].sort());
});

it("sends only the client namespaces, in every locale", () => {
  for (const all of Object.values(messages)) {
    const picked = pickClientMessages(all);
    expect(Object.keys(picked).sort()).toEqual([...CLIENT_NAMESPACES].sort());
    expect(picked).not.toHaveProperty("legal");
  }
});
