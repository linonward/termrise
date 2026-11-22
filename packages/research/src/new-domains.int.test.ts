import { deflateRawSync } from "node:zlib";

import { afterAll, beforeEach, expect, it } from "vitest";

import { newDomains, newWords } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createNewDomains } from "./new-domains";

const db = testDb();
const now = () => new Date("2026-11-22T06:00:00Z");

function zipOf(text: string) {
  const body = Buffer.from(text);
  const data = deflateRawSync(body);
  const name = "domain-names.txt";
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt16LE(name.length, 26);
  local.write(name, 30);
  const dir = Buffer.alloc(46 + name.length);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(8, 10);
  dir.writeUInt32LE(data.length, 20);
  dir.writeUInt16LE(name.length, 28);
  dir.write(name, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(local.length + data.length, 16);
  return Buffer.concat([local, data, dir, end]);
}

beforeEach(resetDb);
afterAll(closeTestDb);

it("imports yesterday's list once, probes, hands over phrases and cross-checks new words", async () => {
  const lists: string[] = [];
  const fake = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("whoisds.com")) {
      lists.push(url);
      return new Response(
        zipOf(
          [
            "secret-santa-no-email.com",
            "weightcalculator.org",
            "nowakkapelusznik.com",
            "parkedfilter.com",
            "goodbyegta5aivideo-maker.com",
          ].join("\n"),
        ),
      );
    }
    if (url.includes("secret-santa-no-email"))
      return new Response(
        '<title>Secret Santa</title><a href="/pricing">Plans</a>',
      );
    if (url.includes("parkedfilter"))
      return new Response("<title>Domain for sale</title>");
    throw new Error("ENOTFOUND");
  }) as typeof fetch;
  // A new word from this week whose letters a new domain carries.
  await db
    .insert(newWords)
    .values({ phrase: "goodbye gta 5 ai video", firstSeenAt: now() });
  const d = createNewDomains({ database: db, fetch: fake, now });
  const items = await d.names(20);
  // Yesterday's list, by its base64 name.
  expect(lists).toHaveLength(1);
  expect(lists[0]).toContain(Buffer.from("2026-11-21.zip").toString("base64"));
  expect(items).toEqual(
    expect.arrayContaining([
      {
        name: "secret santa no email",
        heat: 3,
        releasedAt: "2026-11-21T00:00:00.000Z",
      },
      {
        name: "weight calculator",
        heat: 1,
        releasedAt: "2026-11-21T00:00:00.000Z",
      },
      {
        name: "goodbye gta 5 ai video",
        heat: 2,
        releasedAt: "2026-11-21T00:00:00.000Z",
      },
    ]),
  );
  // Parked pages and names without a phrase go no further; the list is not read twice.
  expect(items.map((i) => i.name)).not.toContain("parked filter");
  const stored = await db.select().from(newDomains);
  expect(stored.map((r) => r.domain).sort()).toEqual([
    "goodbyegta5aivideo-maker.com",
    "parkedfilter.com",
    "secret-santa-no-email.com",
    "weightcalculator.org",
  ]);
  expect(stored.find((r) => r.domain === "parkedfilter.com")!.status).toBe(
    "parked",
  );
  await d.names(20);
  expect(lists).toHaveLength(1);
});
