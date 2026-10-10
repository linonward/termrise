"use client";
import { Check, Copy, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

// The Product Brief the API built (docs/product/ux.md#opportunities): copy or download it.
export function BriefPanel({
  markdown,
  fileName,
}: {
  markdown: string;
  fileName: string;
}) {
  const t = useTranslations("brief");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function copy() {
    setError(false);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
    } catch {
      setError(true);
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button className="h-10 gap-2 px-4" onClick={download}>
          <Download aria-hidden="true" className="size-4" />
          {t("download")}
        </Button>
        <Button variant="outline" className="h-10 gap-2 px-4" onClick={copy}>
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {t("copyFailed")}
        </p>
      )}
      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer px-6 py-4 text-[15px] font-semibold">
          {t("preview")}
        </summary>
        <pre
          data-testid="brief-preview"
          className="max-h-120 overflow-auto border-t border-border p-6 text-[13px] whitespace-pre-wrap"
        >
          {markdown}
        </pre>
      </details>
    </div>
  );
}
