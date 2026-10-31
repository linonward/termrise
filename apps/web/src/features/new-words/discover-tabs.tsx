import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@repo/ui/utils";

// Discover's two halves: rising search words, and newly launched sites.
export function DiscoverTabs({ current }: { current: "words" | "sites" }) {
  const t = useTranslations("discover");
  const tab = (key: "words" | "sites", href: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={cn(
        "border-b-2 px-1 pb-2 text-[15px]",
        current === key
          ? "border-brand font-semibold text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {t(`tab.${key}`)}
    </Link>
  );
  return (
    <nav aria-label={t("tabs")} className="flex gap-6 border-b border-border">
      {tab("words", "/discover")}
      {tab("sites", "/discover/sites")}
    </nav>
  );
}
