import { describe, expect, it } from "vitest";

import {
  findCannibalization,
  findStrikingDistance,
  readGscExport,
} from "./gsc.mjs";

const columns = {
  query: "query",
  page: "page",
  clicks: "clicks",
  impressions: "impressions",
  position: "position",
};

const csv = [
  "query,page,clicks,impressions,position",
  "AI Credits,https://example.com/blog/a,5,300,9.4",
  "ai credits,https://example.com/pricing,1,120,14",
  "ai credits,https://example.com/,0,3,40",
  "buy credits,https://example.com/pricing,20,400,3.1",
  "rare,https://example.com/blog/a,0,4,12",
  ",https://example.com/,1,1,1",
].join("\n");

it("reads query × page rows and skips rows without a query", () => {
  const rows = readGscExport(csv, columns);
  expect(rows).toHaveLength(5);
  expect(rows[0]).toEqual({
    query: "ai credits",
    page: "https://example.com/blog/a",
    clicks: 5,
    impressions: 300,
    position: 9.4,
  });
});

describe("findCannibalization", () => {
  it("lists queries that show two or more pages, largest first", () => {
    const found = findCannibalization(readGscExport(csv, columns), 10);
    expect(found).toEqual([
      {
        query: "ai credits",
        impressions: 423,
        pages: [
          expect.objectContaining({ page: "https://example.com/blog/a" }),
          expect.objectContaining({ page: "https://example.com/pricing" }),
          expect.objectContaining({ page: "https://example.com/" }),
        ],
      },
    ]);
  });
});

describe("findStrikingDistance", () => {
  it("lists rows at positions 8–20 with enough impressions", () => {
    const found = findStrikingDistance(readGscExport(csv, columns), {
      minImpressions: 10,
    });
    expect(found.map((row) => [row.query, row.page])).toEqual([
      ["ai credits", "https://example.com/blog/a"],
      ["ai credits", "https://example.com/pricing"],
    ]);
  });
});
