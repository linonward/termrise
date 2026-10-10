import { expect, it } from "vitest";

import { parseCsv } from "./csv";

it("parses quoted fields, escaped quotes and both line endings", () => {
  expect(parseCsv('﻿term,note\r\n"a, b","say ""hi"""\nplain,\n\n')).toEqual([
    { line: 1, cells: ["term", "note"] },
    { line: 2, cells: ["a, b", 'say "hi"'] },
    { line: 3, cells: ["plain", ""] },
  ]);
});

it("keeps line breaks inside quotes and the line each row starts on", () => {
  expect(parseCsv('term\n"two\nlines"\n,\nlast\n')).toEqual([
    { line: 1, cells: ["term"] },
    { line: 2, cells: ["two\nlines"] },
    { line: 5, cells: ["last"] },
  ]);
});
