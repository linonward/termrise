// How crowded a keyword's top results are (docs/architecture/data-model.md#opportunities),
// from the stored SERP alone: no AI, the same results give the same numbers.

export type SerpCompetition = {
  phrase: string;
  /** Organic results counted, at most 10. */
  results: number;
  /** Results that are a site's home page: hard to outrank with a page. */
  homepages: number;
  /** Results that are an inner page of a site: a page can compete with them. */
  innerPages: number;
  /** Results whose title holds every word of the keyword: made for this search. */
  dedicatedPages: number;
};

// A path of nothing but a locale ("/en", "/zh-cn/") is still the home page.
const LOCALE = /^[a-z]{2}(-[a-z]{2,4})?$/i;

export function isHomepage(url: string) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return (
      segments.length === 0 ||
      (segments.length === 1 && LOCALE.test(segments[0]))
    );
  } catch {
    return false;
  }
}

// Lower case words without punctuation; a plural "s" is dropped so "note" matches "notes".
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));

export function isDedicated(title: string, phrase: string) {
  const wanted = words(phrase);
  if (wanted.length === 0) return false;
  const have = new Set(words(title));
  return wanted.every((w) => have.has(w));
}

export function serpCompetition(
  phrase: string,
  results: { url: string; title: string }[],
): SerpCompetition {
  const top = results.slice(0, 10);
  const homepages = top.filter((r) => isHomepage(r.url)).length;
  return {
    phrase,
    results: top.length,
    homepages,
    innerPages: top.length - homepages,
    dedicatedPages: top.filter((r) => isDedicated(r.title, phrase)).length,
  };
}
