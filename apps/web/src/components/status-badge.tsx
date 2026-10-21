import { LoaderCircle } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";

import type { StatusBadge as Style } from "@/lib/status-badges";

/** A status badge from its mapping (lib/status-badges.ts); loader-circle spins. */
export function StatusBadge({
  badge,
  children,
  ...props
}: {
  badge: Style;
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Badge
      tone={badge.tone}
      icon={badge.icon}
      spin={badge.icon === LoaderCircle}
      {...props}
    >
      {children}
    </Badge>
  );
}
