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
