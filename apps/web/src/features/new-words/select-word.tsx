"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@repo/ui/components/button";

import { usePoolAction } from "@/features/pool/pool-action";

// Selecting a new word starts its product; the page moves there (docs/product/ux.md#products).
export function SelectWord({ id }: { id: string }) {
  const t = useTranslations("newWords");
  const router = useRouter();
  const { post, pending, error } = usePoolAction();
  return (
    <div className="space-y-1">
      <Button
        disabled={pending}
        onClick={async () => {
          const done = await post(`/api/pool/new-words/${id}/select`, {});
          if (done?.productId) router.push(`/products/${done.productId}`);
        }}
      >
        {t("select")}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
