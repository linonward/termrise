// Public shape of a launch site (docs/architecture/api.md).
import type { LaunchSite } from "./launch-sites";

export function toLaunchSiteDto(s: LaunchSite) {
  return {
    id: s.id,
    source: s.source,
    sourceUrl: s.sourceUrl,
    site: s.site,
    url: s.url,
    postTitle: s.postTitle,
    score: s.score,
    comments: s.comments,
    postedAt: s.postedAt?.toISOString() ?? null,
    registeredOn: s.registeredOn,
    pageTitle: s.pageTitle,
    category: s.category,
    motive: s.motive,
    stated: s.stated,
    about: s.about,
    audience: s.audience,
    why: s.why,
    coreKeyword: s.coreKeyword,
    keywordNote: s.keywordNote,
    monetization: s.monetization,
    analyzed: s.analyzedAt !== null,
    hidden: s.hiddenAt !== null,
  };
}

export type LaunchSiteDto = ReturnType<typeof toLaunchSiteDto>;
