import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@repo/ui/utils";

// The two halves of Opportunities: the opportunities, and the research projects that
// produce them (docs/product/ux.md#opportunities).
export function OpportunityTabs({
  current,
}: {
  current: "opportunities" | "research";
}) {
  const t = useTranslations("nav");
  const tab = (
    key: "opportunities" | "research",
    href: string,
    label: string,
  ) => (
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
      {label}
    </Link>
  );
  return (
    <nav
      aria-label={t("opportunityTabs")}
      className="flex gap-6 border-b border-border"
    >
      {tab("opportunities", "/opportunities", t("opportunities"))}
      {tab("research", "/opportunities/research", t("researchProjects"))}
    </nav>
  );
}
