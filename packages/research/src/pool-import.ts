// Imports keyword-lab's pool (docs/product/keyword-pool.md#keyword-lab): research/pool.csv
// for each keyword's verdict and dates, and the round CSVs for its latest numbers. Each
// keyword gets one import check; a keyword imported before is left alone, so a rerun adds
// nothing.
import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { POOL_STATUSES, poolChecks, poolKeywords } from "@repo/db/schema";

import { parseCsv } from "./csv";
import {
  createKeywordPool,
  normalizePhrase,
  type PoolStatus,
} from "./pool-service";

type Row = Record<string, string>;

function records(text: string): Row[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) return [];
  return rows.map(({ cells }) =>
    Object.fromEntries(
      header.cells.map((h, i) => [h.trim(), (cells[i] ?? "").trim()]),
    ),
  );
}

const number = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? Math.round(n) : null;
};
const day = (v: string | undefined) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;

export async function importKeywordLab(
  database: Database,
  input: { pool: string; rounds: string[] },
) {
  const pool = createKeywordPool({ database });
  // The latest round row per keyword holds its numbers.
  const latest = new Map<string, Row>();
  for (const text of input.rounds)
    for (const row of records(text)) {
      const key = normalizePhrase(row.keyword ?? "");
      const prev = latest.get(key);
      if (key && (!prev || (row.date ?? "") >= (prev.date ?? "")))
        latest.set(key, row);
    }
  const rows = records(input.pool).filter((r) => r.keyword);
  const phrases = rows.map((r) => normalizePhrase(r.keyword));
  const done = new Set(
    phrases.length === 0
      ? []
      : (
          await database
            .select({ phrase: poolKeywords.phrase })
            .from(poolChecks)
            .innerJoin(poolKeywords, eq(poolChecks.keywordId, poolKeywords.id))
            .where(
              and(
                eq(poolChecks.kind, "import"),
                inArray(poolKeywords.phrase, phrases),
              ),
            )
        ).map((r) => r.phrase),
  );
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const phrase = normalizePhrase(row.keyword);
    if (done.has(phrase)) {
      skipped++;
      continue;
    }
    const status = (POOL_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as PoolStatus)
      : "unsure";
    const numbers = latest.get(phrase) ?? {};
    const cpc = Number(numbers.cpc);
    await pool.record({
      phrase,
      source: row.source || null,
      status,
      reasons: row.reason
        ? [
            {
              rule: "imported",
              result: status === "failed" ? "fail" : "note",
              value: row.reason,
            },
          ]
        : [],
      kind: "import",
      at: day(row.last_checked) ?? day(row.first_seen) ?? new Date(),
      nextCheckAt: day(row.next_check),
      data: { keywordLab: { ...row, ...numbers } },
      fields: {
        searchVolume: number(numbers.volume_us),
        keywordDifficulty: number(numbers.kd),
        cpcMicros:
          numbers.cpc && Number.isFinite(cpc)
            ? Math.round(cpc * 1_000_000)
            : null,
        variantCount: number(numbers.variations_50plus),
        strongCompetitors: number(numbers.strong_competitors_top10),
        innerPages: number(numbers.inner_pages_top10),
      },
    });
    // keyword-lab's first-seen date, not the import's.
    const first = day(row.first_seen);
    if (first)
      await database
        .update(poolKeywords)
        .set({ firstSeenAt: first })
        .where(eq(poolKeywords.phrase, phrase));
    imported++;
  }
  return { imported, skipped };
}
