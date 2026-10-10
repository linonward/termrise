import {
  HACKER_NEWS_ITEM_URL,
  type HackerNewsList,
} from "./adapters/hacker-news";
import type { RadarItem, RadarObservation } from "./radar";
import type { Lifecycle } from "./radar-lifecycle";
import { seedFromTerm } from "./radar-rules";

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
    discussionUrl: `${HACKER_NEWS_ITEM_URL}${i.externalId}`,
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
    list: o.list as HackerNewsList,
    rank: o.rank,
    score: o.score,
    comments: o.comments,
  };
}

export type RadarObservationDto = ReturnType<typeof toRadarObservationDto>;
