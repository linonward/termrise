import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { cn } from "@repo/ui/utils";

import { apiGet } from "@/server/api/api";

type Tab = "words" | "sites" | "platforms";
const TABS: [Tab, string][] = [
  ["words", "/discover"],
  ["sites", "/discover/sites"],
  ["platforms", "/discover/platforms"],
];

/**
 * The discover section (S74): one heading, then its three tabs with what each shows. The
 * tab's own intro and status come as children, under the tabs.
 */
export async function DiscoverHeader({
  current,
  children,
}: {
  current: Tab;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("discover");
  const counts = await apiGet<Record<Tab, number>>("/api/pool/discover");
  return (
    <>
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="space-y-4">
        <nav
          aria-label={t("tabs")}
          className="-mx-5 flex gap-6 overflow-x-auto border-b border-border px-5 md:mx-0 md:px-0"
        >
          {TABS.map(([key, href]) => (
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
              {t(`tab.${key}`)}{" "}
              <span className="font-mono text-[13px] font-normal tabular-nums">
                {counts[key]}
              </span>
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </>
  );
}
