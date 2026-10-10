import { GOOGLE_TRENDS_PAGE } from "./adapters/google-trends";
import { HACKER_NEWS_ITEM_URL } from "./adapters/hacker-news";
import type { RadarItem, RadarObservation } from "./radar";
import type { Lifecycle } from "./radar-lifecycle";
import { seedFromTerm } from "./radar-rules";

// Where the item can be seen at its source: the HN discussion, or Trending Now for the
// market (external id "<geo>:<day>:<term>").
function sourceUrl(i: RadarItem) {
  return i.provider === "google_trends"
    ? `${GOOGLE_TRENDS_PAGE}?geo=${encodeURIComponent(i.externalId.split(":")[0])}`
    : `${HACKER_NEWS_ITEM_URL}${i.externalId}`;
}

// Public shape of a radar item: the source link, the discussion link and a seed to start
// research with.
export function toRadarItemDto(
  i: RadarItem & { lifecycle: Lifecycle; starred: boolean },
) {
  return {
    id: i.id,
    provider: i.provider,
    title: i.title,
    term: i.normalizedTerm,
    suggestedSeed: seedFromTerm(i.normalizedTerm),
    url: i.url,
    sourceUrl: sourceUrl(i),
    postedAt: i.postedAt?.toISOString() ?? null,
    firstSeenAt: i.firstSeenAt.toISOString(),
    lastSeenAt: i.lastSeenAt.toISOString(),
    score: i.score,
    comments: i.comments,
    lifecycle: i.lifecycle,
    starred: i.starred,
  };
}

export type RadarItemDto = ReturnType<typeof toRadarItemDto>;

export function toRadarObservationDto(o: RadarObservation) {
  return {
    observedAt: o.observedAt.toISOString(),
    list: o.list,
    rank: o.rank,
    score: o.score,
    comments: o.comments,
  };
}

export type RadarObservationDto = ReturnType<typeof toRadarObservationDto>;
