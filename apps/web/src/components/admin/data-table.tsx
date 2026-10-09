import type { ReactNode } from "react";

// Same table style as the billing purchase history (desktop-billing.png).
export function DataTable({
  columns,
  rows,
  empty,
  testId,
}: {
  columns: string[];
  rows: { key: string; cells: ReactNode[] }[];
  empty: string;
  testId: string;
}) {
  if (rows.length === 0)
    return <p className="text-[15px] text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-180 text-left text-sm">
        <thead className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th key={c} scope="col" className="py-3 pr-4 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              data-testid={testId}
              className="border-b border-border"
            >
              {row.cells.map((cell, i) => (
                <td key={i} className="py-3.5 pr-4 break-all">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
