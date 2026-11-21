import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { cn } from "@repo/ui/utils";

// The workbench's sections (docs/product/ux.md#navigation, S91): each has one heading
// and a row of tabs, one per page. The page's own intro and actions come as children.
export const SECTIONS = {
  find: [
    ["words", "/discover"],
    ["sites", "/discover/sites"],
    ["platforms", "/discover/platforms"],
    ["watch", "/discover/watch"],
    ["evergreen", "/keywords"],
  ],
  build: [
    ["products", "/products"],
    ["opportunities", "/opportunities"],
    ["research", "/opportunities/research"],
  ],
  fleet: [
    ["sites", "/sites"],
    ["expenses", "/settings/expenses"],
  ],
} as const;

export type Section = keyof typeof SECTIONS;
export type SectionTab<S extends Section> = (typeof SECTIONS)[S][number][0];

export async function SectionHeader<S extends Section>({
  section,
  current,
  counts,
  children,
}: {
  section: S;
  current: SectionTab<S>;
  counts?: Partial<Record<SectionTab<S>, number>>;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("sections");
  // Keys are built from the section; every section has the same shape in zh.json.
  const label = (key: string) => t(key as "find.title");
  return (
    <>
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
          {label(`${section}.title`)}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {label(`${section}.subtitle`)}
        </p>
      </header>
      <div className="space-y-4">
        <nav
          aria-label={label(`${section}.tabs`)}
          className="-mx-5 flex gap-6 overflow-x-auto border-b border-border px-5 md:mx-0 md:px-0"
        >
          {(SECTIONS[section] as readonly (readonly [string, string])[]).map(
            ([key, href]) => {
              const n = (counts as Record<string, number | undefined>)?.[key];
              return (
                <Link
                  key={key}
                  href={href}
                  aria-current={current === key ? "page" : undefined}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-1 pb-2 text-[15px] whitespace-nowrap",
                    current === key
                      ? "border-brand font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label(`${section}.tab.${key}`)}
                  {n !== undefined && (
                    <>
                      {" "}
                      <span className="font-mono text-[13px] font-normal tabular-nums">
                        {n}
                      </span>
                    </>
                  )}
                </Link>
              );
            },
          )}
        </nav>
        {children}
      </div>
    </>
  );
}
