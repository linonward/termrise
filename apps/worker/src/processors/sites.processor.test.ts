import { expect, it, vi } from "vitest";

import { sitesProcessors } from "./sites.processor";

it("fetches site-ops's export and writes it", async () => {
  const exp = { sites: [] } as never;
  const siteSync = {
    fetch: vi.fn(async () => exp),
    sync: vi.fn(async () => ({ sites: 0, daily: 0 })),
  };
  await sitesProcessors({ siteSync })["sites.sync"]();
  expect(siteSync.sync).toHaveBeenCalledWith(exp);
});

it("fails when the sync is not set up, so a stale schedule shows", async () => {
  await expect(sitesProcessors({})["sites.sync"]()).rejects.toThrow("disabled");
});

it("lets a failed fetch fail the job without writing", async () => {
  const siteSync = {
    fetch: vi.fn(async () => Promise.reject(new Error("403"))),
    sync: vi.fn(),
  };
  await expect(sitesProcessors({ siteSync })["sites.sync"]()).rejects.toThrow(
    "403",
  );
  expect(siteSync.sync).not.toHaveBeenCalled();
});
