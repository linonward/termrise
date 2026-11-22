import { deflateRawSync } from "node:zlib";

import { expect, it } from "vitest";

import {
  keepDomain,
  phraseOfDomain,
  probeDomain,
  unzipOne,
} from "./new-domains";

/** A one-file zip archive, deflated, as WhoisDS sends it. */
function zipOf(name: string, text: string) {
  const body = Buffer.from(text);
  const data = deflateRawSync(body);
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.write(name, 30);
  const dir = Buffer.alloc(46 + name.length);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(8, 10);
  dir.writeUInt32LE(data.length, 20);
  dir.writeUInt32LE(body.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt32LE(0, 42);
  dir.write(name, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(local.length + data.length, 16);
  return Buffer.concat([local, data, dir, end]);
}

it("reads the one file of a zip archive", () => {
  expect(unzipOne(zipOf("domain-names.txt", "a.com\nb.net\n")).toString()).toBe(
    "a.com\nb.net\n",
  );
});

it("keeps tool-like domains on tool TLDs and reads their phrase", () => {
  expect(keepDomain("secret-santa-no-email.com")).toBe("secret-santa-no-email");
  expect(keepDomain("weightcalculator.org")).toBe("weightcalculator");
  expect(keepDomain("nowakkapelusznik.com")).toBeNull(); // no tool word
  expect(keepDomain("acd-ops.com")).toBeNull(); // hyphens alone are not enough
  expect(keepDomain("photo-ai-studio.com")).toBe("photo-ai-studio");
  expect(keepDomain("travelos.co.il")).toBeNull();
  expect(keepDomain("calculator2024.cn")).toBeNull();
  expect(phraseOfDomain("secret-santa-no-email")).toBe("secret santa no email");
  expect(phraseOfDomain("weightcalculator")).toBe("weight calculator");
  expect(phraseOfDomain("zakatcalculatorbd")).toBeNull();
  expect(phraseOfDomain("1f4u0r-02z-generator")).toBeNull();
  expect(phraseOfDomain("gta-5-filter")).toBe("gta 5 filter");
  expect(keepDomain("deluxevibe-casino-nl.com")).toBeNull();
  expect(phraseOfDomain("biittrad-co-jp")).toBeNull(); // a country code
});

it("tells a live page with pricing from a parked one and a silent one", async () => {
  const page = (html: string, status = 200) =>
    (async () => new Response(html, { status })) as unknown as typeof fetch;
  expect(
    await probeDomain(
      page(
        '<title>Secret Santa No Email</title><a href="/pricing">Pricing</a>',
      ),
      "x.com",
    ),
  ).toEqual({
    status: "live",
    title: "Secret Santa No Email",
    hasPricing: true,
  });
  expect(
    (await probeDomain(page("<title>x.com is for sale</title>"), "x.com"))
      .status,
  ).toBe("parked");
  expect(
    (
      await probeDomain(
        (async () => {
          throw new Error("ENOTFOUND");
        }) as unknown as typeof fetch,
        "x.com",
      )
    ).status,
  ).toBe("unresolved");
});
