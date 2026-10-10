import { createHash } from "node:crypto";

import { parseCsv } from "./csv";
import {
  CSV_COLUMNS,
  MAX_CSV_LENGTH,
  MAX_CSV_ROWS,
  normalizeSeeds,
  SEED_MAX_LENGTH,
  type CsvProblem,
  type RejectReason,
} from "./research-rules";

export type ParsedSignal = {
  externalId: string;
  rawTitle: string;
  normalizedTerm: string;
  url: string | null;
  observedAt: Date | null;
  metadata: Record<string, string>;
};

export type ParsedCsv =
  | { ok: false; problem: CsvProblem }
  | {
      ok: true;
      signals: ParsedSignal[];
      rejected: { line: number; reason: RejectReason }[];
    };

const isHttpUrl = (value: string) => {
  if (!URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === "http:" || protocol === "https:";
};

// YYYY-MM-DD (read as UTC) or a full ISO timestamp with a zone.
function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Validates a CSV upload row by row; invalid rows are reported, valid rows kept. */
export function parseSignalCsv(text: string): ParsedCsv {
  if (text.length > MAX_CSV_LENGTH) return { ok: false, problem: "too_large" };
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, problem: "empty" };
  if (rows.length - 1 > MAX_CSV_ROWS)
    return { ok: false, problem: "too_many_rows" };
  const header = rows[0].cells.map((name) => name.trim().toLowerCase());
  const column = (name: (typeof CSV_COLUMNS)[number]) => header.indexOf(name);
  if (column("term") === -1)
    return { ok: false, problem: "missing_term_column" };

  const signals: ParsedSignal[] = [];
  const rejected: { line: number; reason: RejectReason }[] = [];
  for (const { line, cells } of rows.slice(1)) {
    const cell = (name: (typeof CSV_COLUMNS)[number]) =>
      column(name) === -1 ? "" : (cells[column(name)] ?? "").trim();
    const rawTitle = cell("term");
    const [normalizedTerm] = normalizeSeeds([rawTitle]);
    const reject = (reason: RejectReason) => rejected.push({ line, reason });
    if (!normalizedTerm) {
      reject("missing_term");
      continue;
    }
    if (normalizedTerm.length > SEED_MAX_LENGTH) {
      reject("term_too_long");
      continue;
    }
    const url = cell("url") || null;
    if (url && !isHttpUrl(url)) {
      reject("invalid_url");
      continue;
    }
    const observedText = cell("observed_at");
    const observedAt = observedText ? parseDate(observedText) : null;
    if (observedText && !observedAt) {
      reject("invalid_date");
      continue;
    }
    const metadata: Record<string, string> = {};
    for (const key of ["source", "note"] as const)
      if (cell(key)) metadata[key] = cell(key).slice(0, 500);
    // The same term, link and date is the same observation: importing it again is a no-op.
    const externalId = createHash("sha256")
      .update(
        [normalizedTerm, url ?? "", observedAt?.toISOString() ?? ""].join("\n"),
      )
      .digest("hex");
    signals.push({
      externalId,
      rawTitle: rawTitle.slice(0, 500),
      normalizedTerm,
      url,
      observedAt,
      metadata,
    });
  }
  return { ok: true, signals, rejected };
}
