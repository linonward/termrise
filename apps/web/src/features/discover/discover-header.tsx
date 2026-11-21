import { SectionHeader } from "@/components/section-header";
import { apiGet } from "@/server/api/api";

type Tab = "words" | "sites" | "platforms" | "watch" | "evergreen";

/**
 * The find section (S74, S91): new words, launch sites, platform sites, watched sites
 * and evergreen keywords, each with what it shows. The tab's intro comes as children.
 */
export async function DiscoverHeader({
  current,
  children,
}: {
  current: Tab;
  children?: React.ReactNode;
}) {
  const counts = await apiGet<Record<Tab, number>>("/api/pool/discover");
  return (
    <SectionHeader section="find" current={current} counts={counts}>
      {children}
    </SectionHeader>
  );
}
