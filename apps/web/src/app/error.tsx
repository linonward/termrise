"use client";
import { CircleAlert, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@repo/ui/components/button";

import { StatusPage } from "@/components/status-page";

// Fallback for render errors below the root layout; global-error.tsx covers the layout itself.
export default function Error({ reset }: { reset: () => void }) {
  const t = useTranslations("errorPage");
  return (
    <StatusPage
      icon={CircleAlert}
      tone="destructive"
      title={t("title")}
      body={t("body")}
    >
      <Button className="h-10 px-5" onClick={reset}>
        <RotateCcw aria-hidden="true" />
        {t("retry")}
      </Button>
      <Button asChild variant="outline" className="h-10 px-5">
        <Link href="/dashboard">{t("home")}</Link>
      </Button>
    </StatusPage>
  );
}
