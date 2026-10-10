import { expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";

it("forwards only the cookies and returns the JSON body", async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({ balance: 3 }),
  );
  const { get: apiGet } = createApiClient("https://api.test", transport);
  const headers = new Headers({ cookie: "a=1", authorization: "secret" });
  expect(await apiGet("/api/credits/balance", headers)).toEqual({ balance: 3 });
  const [url, init] = transport.mock.calls[0];
  expect(String(url)).toBe("https://api.test/api/credits/balance");
  expect(init!.headers).toEqual({ cookie: "a=1" });
  expect(init!.cache).toBe("no-store");
});

it("throws when the API fails", async () => {
  const { get: apiGet } = createApiClient(
    "https://api.test",
    async () => new Response("down", { status: 503 }),
  );
  await expect(apiGet("/api/tasks", new Headers())).rejects.toThrow(
    "API /api/tasks failed: 503",
  );
});

it("sends a JSON body and returns the response as it is", async () => {
  const transport = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 404 }),
  );
  const { request } = createApiClient("https://api.test", transport);
  const response = await request("/api/admin/users/search", new Headers(), {
    method: "POST",
    body: JSON.stringify({ query: "a@example.com" }),
  });
  expect(response.status).toBe(404);
  expect(transport.mock.calls[0][1]!.headers).toEqual({
    "content-type": "application/json",
    cookie: "",
  });
});
