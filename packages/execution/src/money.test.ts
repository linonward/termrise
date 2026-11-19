import { expect, it } from "vitest";

import { monthRange, parseRdap, registrableDomain } from "./money";

it("takes the registrable domain of a host", () => {
  expect(registrableDomain("radio.vivclip.com")).toBe("vivclip.com");
  expect(registrableDomain("WindowPeeper.org.")).toBe("windowpeeper.org");
  expect(registrableDomain("cork7game.com")).toBe("cork7game.com");
});

it("reads expiration and registrar from an RDAP answer", () => {
  expect(
    parseRdap({
      events: [
        { eventAction: "registration", eventDate: "2025-01-02T03:04:05Z" },
        { eventAction: "expiration", eventDate: "2026-12-01T00:00:00Z" },
      ],
      entities: [
        {
          roles: ["registrar"],
          vcardArray: [
            "vcard",
            [
              ["version", {}, "text", "4.0"],
              ["fn", {}, "text", "Cloudflare, Inc."],
            ],
          ],
        },
      ],
    }),
  ).toEqual({
    expiresAt: new Date("2026-12-01T00:00:00Z"),
    registrar: "Cloudflare, Inc.",
  });
  expect(parseRdap({})).toEqual({ expiresAt: null, registrar: null });
  expect(
    parseRdap({ events: [{ eventAction: "expiration", eventDate: "soon" }] }),
  ).toEqual({ expiresAt: null, registrar: null });
});

it("gives a month's first day and the next month's", () => {
  expect(monthRange("2026-11")).toEqual({
    from: "2026-11-01",
    to: "2026-12-01",
  });
  expect(monthRange("2026-12")).toEqual({
    from: "2026-12-01",
    to: "2027-01-01",
  });
});
