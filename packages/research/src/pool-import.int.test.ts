import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { importKeywordLab } from "./pool-import";
import { createKeywordPool } from "./pool-service";

const db = testDb();
const pool = createKeywordPool({ database: db });

beforeEach(resetDb);
afterAll(closeTestDb);

const poolCsv = `keyword,source,first_seen,last_checked,status,reason,next_check,round
cipher decoder,ranked:convertcase.net,2026-10-31,2026-10-31,selected,"S1 107 variants; 14,800/mo",,keyword-research-20261031-convertcase.csv
dividend calculator,suffix:calculator,2026-10-04,2026-10-31,failed,H6 ③ relative -35%,2027-01-29,keyword-research-20261031-calculator.csv
`;
const roundCsv = `date,seed,keyword,volume_us,kd,cpc,variations_50plus,strong_competitors_top10,inner_pages_top10,status,reason
2026-10-04,calculator,dividend calculator,9900,20,1.5,,,,pending,
2026-10-31,ranked:convertcase.net,cipher decoder,14800,14,2,107,0,7,selected,
`;

it("imports verdicts, dates and numbers once", async () => {
  expect(
    await importKeywordLab(db, { pool: poolCsv, rounds: [roundCsv] }),
  ).toEqual({
    imported: 2,
    skipped: 0,
  });
  const { items } = await pool.list({ sort: "volume" });
  expect(items[0]).toMatchObject({
    phrase: "cipher decoder",
    status: "selected",
    searchVolume: 14800,
    keywordDifficulty: 14,
    cpcMicros: 2_000_000,
    variantCount: 107,
    strongCompetitors: 0,
    nextCheckAt: null,
    reasons: [
      { rule: "imported", result: "note", value: "S1 107 variants; 14,800/mo" },
    ],
  });
  expect(items[1]).toMatchObject({
    phrase: "dividend calculator",
    status: "failed",
    nextCheckAt: new Date("2027-01-29T00:00:00Z"),
    firstSeenAt: new Date("2026-10-04T00:00:00Z"),
  });
  expect(
    await importKeywordLab(db, { pool: poolCsv, rounds: [roundCsv] }),
  ).toEqual({
    imported: 0,
    skipped: 2,
  });
});
