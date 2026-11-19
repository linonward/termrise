import { CircleCheck, CircleX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@repo/ui/components/badge";

// Up or down as site-ops alerts it: down after two failed checks in a row.
export async function SiteState({ state }: { state: "up" | "down" }) {
  const t = await getTranslations("sites");
  return state === "down" ? (
    <Badge tone="danger" icon={CircleX}>
      {t("down")}
    </Badge>
  ) : (
    <Badge tone="success" icon={CircleCheck}>
      {t("up")}
    </Badge>
  );
}
