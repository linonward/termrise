import { expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";

it("forwards only the cookies and returns the JSON body", async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({ balance: 3 }),
  );
  const apiGet = createApiClient("https://api.test", transport);
  const headers = new Headers({ cookie: "a=1", authorization: "secret" });
  expect(await apiGet("/api/credits/balance", headers)).toEqual({ balance: 3 });
  const [url, init] = transport.mock.calls[0];
  expect(String(url)).toBe("https://api.test/api/credits/balance");
  expect(init!.headers).toEqual({ cookie: "a=1" });
  expect(init!.cache).toBe("no-store");
});

it("throws when the API fails", async () => {
  const apiGet = createApiClient(
    "https://api.test",
    async () => new Response("down", { status: 503 }),
  );
  await expect(apiGet("/api/tasks", new Headers())).rejects.toThrow(
    "API /api/tasks failed: 503",
  );
});
