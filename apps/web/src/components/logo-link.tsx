import Link from "next/link";
import { useTranslations } from "next-intl";

import { LogoMark } from "@/components/logo-mark";

// Logo/Full linking home, for pages with a logo-only top bar (auth, 404, error).
export function LogoLink() {
  const t = useTranslations("meta");
  return (
    <Link href="/" className="flex items-center gap-2">
      <LogoMark className="size-5.5" />
      <span className="font-heading text-xl font-bold tracking-tight">
        {t("title")}
      </span>
    </Link>
  );
}
