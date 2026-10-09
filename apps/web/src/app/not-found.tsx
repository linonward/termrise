import { House, SearchX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@repo/ui/components/button";

import { StatusPage } from "@/components/status-page";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <StatusPage
      icon={SearchX}
      tone="neutral"
      code={t("code")}
      title={t("title")}
      body={t("body")}
    >
      <Button asChild className="h-10 px-5">
        <Link href="/">
          <House aria-hidden="true" />
          {t("home")}
        </Link>
      </Button>
      <Button asChild variant="outline" className="h-10 px-5">
        <Link href="/dashboard">{t("dashboard")}</Link>
      </Button>
    </StatusPage>
  );
}
