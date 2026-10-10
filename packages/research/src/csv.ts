export type CsvRow = { line: number; cells: string[] };

// RFC 4180 CSV: quoted fields, "" for a quote inside quotes, CRLF or LF line ends, an
// optional UTF-8 BOM. Each row keeps the line it starts on (1-based), so errors can name
// the line a spreadsheet shows; blank rows are dropped.
export function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const endRow = () => {
    cells.push(field);
    if (cells.some((value) => value.trim() !== ""))
      rows.push({ line: rowLine, cells });
    cells = [];
    field = "";
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else {
        if (char === "\n") line++;
        field += char;
      }
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      cells.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else field += char;
  }
  endRow();
  return rows;
}
