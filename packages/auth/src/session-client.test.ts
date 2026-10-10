import { describe, expect, it, vi } from "vitest";

import { createSessionClient } from "./session-client";

const API = "http://localhost:3001";
const cookie = "better-auth.session_token=abc; other=1";
const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));

describe("createSessionClient", () => {
  it("asks apps/api with the request's cookies", async () => {
    const transport = respond({
      session: { id: "s1" },
      user: { id: "u1", email: "a@example.com", name: "A", image: null },
    });
    const session = await createSessionClient(
      API,
      transport,
    )(new Headers({ cookie, authorization: "Bearer x", host: "evil" }));
    expect(session).toEqual({
      user: { id: "u1", email: "a@example.com", name: "A" },
    });
    const [url, init] = transport.mock.calls[0];
    expect(String(url)).toBe(`${API}/api/auth/get-session`);
    expect(new Headers(init!.headers).get("cookie")).toBe(cookie);
    expect(new Headers(init!.headers).get("authorization")).toBeNull();
    expect(init!.cache).toBe("no-store");
  });

  it("returns null for a request without a session cookie, without a call", async () => {
    const transport = respond(null);
    expect(
      await createSessionClient(API, transport)(new Headers({ cookie: "a=1" })),
    ).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });

  it("returns null for an expired or forged session", async () => {
    expect(
      await createSessionClient(API, respond(null))(new Headers({ cookie })),
    ).toBeNull();
  });

  it("fails when apps/api fails, instead of signing the user out", async () => {
    await expect(
      createSessionClient(API, respond({}, 503))(new Headers({ cookie })),
    ).rejects.toThrow("Session lookup failed: 503");
  });
});
