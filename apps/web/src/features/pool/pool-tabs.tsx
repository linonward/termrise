import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@repo/ui/utils";

// The two halves of the keyword pool: evergreen keywords and new words.
export function PoolTabs({ current }: { current: "evergreen" | "new" }) {
  const t = useTranslations("pool");
  const tab = (key: "evergreen" | "new", href: string) => (
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
      {tab("evergreen", "/pool")}
      {tab("new", "/pool/new")}
    </nav>
  );
}
