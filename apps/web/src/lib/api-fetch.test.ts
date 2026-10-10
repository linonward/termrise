import { afterEach, expect, it, vi } from "vitest";

import { apiFetch } from "./api-fetch";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("calls apps/api with the session cookie", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test");
  const fetchMock = vi.fn(async () => new Response());
  vi.stubGlobal("fetch", fetchMock);
  await apiFetch("/api/checkout", { method: "POST" });
  expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/checkout", {
    method: "POST",
    credentials: "include",
  });
});
