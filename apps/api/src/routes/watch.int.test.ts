import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

// Watched sites (docs/product/keyword-pool.md#site-watch): added, listed and removed.
// The scan itself runs in the worker and is tested in site-watch.int.test.ts.
const { call, signIn } = createTestClient();

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("owner@example.com");
});
afterAll(closeTestDb);

const post = (body: unknown) =>
  call("/api/pool/watch", {
    method: "POST",
    headers: {
      cookie,
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

it("adds a section once, lists it, counts it and removes it", async () => {
  const added = await post({ url: "imagelayered.com/tools" });
  expect(added.status).toBe(201);
  const { id, prefix } = (await added.json()) as { id: string; prefix: string };
  expect(prefix).toBe("https://imagelayered.com/tools/");
  expect((await post({ url: "https://imagelayered.com/tools/" })).status).toBe(
    200,
  );
  expect((await post({ url: "not a site" })).status).toBe(400);

  const list = await (
    await call("/api/pool/watch", { headers: { cookie } })
  ).json();
  expect(list).toMatchObject({
    sources: [{ id, prefix, method: null, pagesKnown: 0 }],
    pages: [],
  });
  const counts = await (
    await call("/api/pool/discover", { headers: { cookie } })
  ).json();
  expect(counts.watch).toBe(1);

  const removed = await call(`/api/pool/watch/${id}`, {
    method: "DELETE",
    headers: { cookie, Origin: TEST_APP_URL },
  });
  expect(removed.status).toBe(204);
  expect((await call("/api/pool/watch")).status).toBe(401);
});
