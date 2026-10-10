import { expect, it } from "vitest";

import { MAX_CSV_ROWS } from "./research-rules";
import { parseSignalCsv } from "./signal-import";

it("reads the template columns in any order and normalizes terms", () => {
  const result = parseSignalCsv(
    "Source,TERM,observed_at,url,note\n" +
      "trends export, AI  Meeting Notes ,2026-10-01,https://example.com/a,rising\n",
  );
  expect(result).toMatchObject({
    ok: true,
    rejected: [],
    signals: [
      {
        rawTitle: "AI  Meeting Notes",
        normalizedTerm: "ai meeting notes",
        url: "https://example.com/a",
        observedAt: new Date("2026-10-01T00:00:00Z"),
        metadata: { source: "trends export", note: "rising" },
      },
    ],
  });
});

it("gives the same row the same id, and a different date a new one", () => {
  const ids = (csv: string) =>
    parseSignalCsv(csv).ok
      ? (
          parseSignalCsv(csv) as { signals: { externalId: string }[] }
        ).signals.map((s) => s.externalId)
      : [];
  const [a, b, c] = ids(
    "term,observed_at\nfoo,2026-10-01\n FOO ,2026-10-01\nfoo,2026-10-02\n",
  );
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

it("reports invalid rows by spreadsheet line and keeps the rest", () => {
  const result = parseSignalCsv(
    "term,url,observed_at,note\n" +
      ",,,no term\n" +
      `${"x".repeat(81)},,\n` +
      "ok,ftp://example.com,\n" +
      "ok,,yesterday\n" +
      "good,,2026-10-01T08:00:00Z\n",
  );
  expect(result).toMatchObject({
    ok: true,
    signals: [{ normalizedTerm: "good" }],
    rejected: [
      { line: 2, reason: "missing_term" },
      { line: 3, reason: "term_too_long" },
      { line: 4, reason: "invalid_url" },
      { line: 5, reason: "invalid_date" },
    ],
  });
});

it("rejects a file without terms, without a term column, or too big", () => {
  expect(parseSignalCsv("term\n")).toEqual({ ok: false, problem: "empty" });
  expect(parseSignalCsv("keyword\nfoo\n")).toEqual({
    ok: false,
    problem: "missing_term_column",
  });
  expect(parseSignalCsv(`term\n${"t\n".repeat(MAX_CSV_ROWS + 1)}`)).toEqual({
    ok: false,
    problem: "too_many_rows",
  });
  expect(parseSignalCsv("x".repeat(1_000_001))).toEqual({
    ok: false,
    problem: "too_large",
  });
});
