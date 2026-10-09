import type { Page } from "@playwright/test";

import { readFakeObject, writeFakeObject } from "@repo/storage/adapters/fake";

import { e2eEnv } from "./e2e-env";

// The E2E server signs fake-storage.test URLs (STORAGE_PROVIDER=fake); the
// browser's PUT and GET to them are answered from the shared directory.
export async function routeFakeStorage(page: Page, { fail = false } = {}) {
  await page.route("https://fake-storage.test/**", async (route) => {
    if (fail) return route.abort("failed");
    const request = route.request();
    const url = new URL(request.url());
    const key = decodeURIComponent(url.pathname.slice(1));
    if (request.method() === "PUT") {
      writeFakeObject(
        e2eEnv.FAKE_STORAGE_DIR,
        key,
        request.headers()["content-type"],
        request.postDataBuffer() ?? new Uint8Array(),
      );
      return route.fulfill({ status: 200 });
    }
    const object = readFakeObject(e2eEnv.FAKE_STORAGE_DIR, key);
    if (!object) return route.fulfill({ status: 404 });
    const filename = url.searchParams.get("download");
    return route.fulfill({
      status: 200,
      contentType: object.contentType,
      body: Buffer.from(object.body),
      headers: filename
        ? { "content-disposition": `attachment; filename="${filename}"` }
        : {},
    });
  });
}
