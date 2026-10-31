import { expect, it } from "vitest";

import { createRdapClient, registrableDomain } from "./rdap";

it("finds the registrable domain of a host", () => {
  expect(registrableDomain("www.cipherdecipher.com")).toBe(
    "cipherdecipher.com",
  );
  expect(registrableDomain("play.google.com")).toBe("google.com");
  expect(registrableDomain("shop.example.co.uk")).toBe("example.co.uk");
});

it("reads the registration date, and gives null when the lookup fails", async () => {
  const ok = createRdapClient({
    fetch: (async () =>
      Response.json({
        events: [
          { eventAction: "expiration", eventDate: "2027-06-15T00:00:00Z" },
          { eventAction: "registration", eventDate: "2026-06-15T10:00:00Z" },
        ],
      })) as typeof fetch,
  });
  expect(await ok.registeredOn("cipherdecoder.com")).toEqual({
    domain: "cipherdecoder.com",
    registeredOn: "2026-06-15",
  });
  const down = createRdapClient({
    fetch: (async () => new Response("no", { status: 404 })) as typeof fetch,
  });
  expect((await down.registeredOn("x.com")).registeredOn).toBeNull();
});

it("names itself, since rdap.org refuses anonymous requests", async () => {
  let agent: string | null = null;
  const client = createRdapClient({
    fetch: (async (_url: string, init: RequestInit) => {
      agent = new Headers(init.headers).get("user-agent");
      return Response.json({ events: [] });
    }) as unknown as typeof fetch,
  });
  await client.registeredOn("x.com");
  expect(agent).toMatch(/^termrise\//);
});
