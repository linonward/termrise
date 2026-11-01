import Link from "next/link";

import { cn } from "@repo/ui/utils";

export type Chip = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  /** How many the chip holds; omitted when unknown. */
  n?: number;
};

/** The filter row inside a discover tab: one chip per choice, with its count. */
export function FilterChips({
  label,
  chips,
}: {
  label: string;
  chips: Chip[];
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0"
    >
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          aria-current={c.active ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[13px] whitespace-nowrap hover:border-border-strong",
            c.active && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {c.label}
          {c.n != null && (
            <span className="font-mono tabular-nums opacity-70">{c.n}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** The tab's one-line intro and its status line (schedule, last round). */
export function TabIntro({
  intro,
  children,
  action,
}: {
  intro: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-180 space-y-1">
        <p className="text-[15px] text-muted-foreground">{intro}</p>
        {children && (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {children}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/** A dot that says whether the tab's last round finished. */
export function RoundDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 rounded-full", ok ? "bg-success" : "bg-warning")}
    />
  );
}
