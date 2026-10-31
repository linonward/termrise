// Public shape of a platform site (docs/architecture/api.md).
import type { PlatformSite } from "./platform-sites";

export function toPlatformSiteDto(
  s: PlatformSite & { monthly: Record<string, number> },
) {
  return {
    id: s.id,
    host: s.host,
    platform: s.platform,
    etv: s.etv,
    monthly: s.monthly,
    topKeyword: s.topKeyword,
    topKeywordVolume: s.topKeywordVolume,
    topKeywordRank: s.topKeywordRank,
    keywordChecked: s.keywordCheckedAt !== null,
    pageTitle: s.pageTitle,
    firstCrawl: s.firstCrawl,
    checkedAt: s.checkedAt?.toISOString() ?? null,
    hidden: s.hiddenAt !== null,
  };
}

export type PlatformSiteDto = ReturnType<typeof toPlatformSiteDto>;
