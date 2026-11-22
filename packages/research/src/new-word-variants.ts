// The same need written differently (docs/product/keyword-pool.md#variants, S96):
// "flyingcar" and "flying car", "goodbye gta 5 ai video" and "gta 5 goodbye video". Only
// one of them is measured; the others hang under it. A long tail (one more telling word,
// "ragdoll robot boxing codes") is not a variant: it stays an inner-page candidate.

/** Words every tool or AI page shares: they do not tell one need from another. */
const GENERIC = new Set(
  "ai a an the free online tool tools app apps for to of and with in on your my best new 2025 2026".split(
    " ",
  ),
);
/** Tool words that mean the same thing. */
const SYNONYMS: Record<string, string> = {
  maker: "generator",
  creator: "generator",
  builder: "generator",
  evaluator: "analyzer",
  analyser: "analyzer",
  convert: "converter",
  changer: "converter",
  editor: "editor",
  remover: "remover",
};

const canonical = (w: string) => {
  const s = SYNONYMS[w] ?? w;
  return s.length > 3 && s.endsWith("s") && !s.endsWith("ss")
    ? s.slice(0, -1)
    : s;
};

/** The keys a phrase is matched on: letters and digits only, and its telling words. */
export function variantKeys(phrase: string): string[] {
  const compact = phrase.toLowerCase().replace(/[^a-z0-9]/g, "");
  const telling = [
    ...new Set(
      phrase
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w && !GENERIC.has(w))
        .map(canonical),
    ),
  ].sort();
  const keys = compact.length >= 4 ? [`c:${compact}`] : [];
  if (telling.length >= 2) keys.push(`t:${telling.join(" ")}`);
  return keys;
}

/** True when two phrases are the same need written differently. */
export function sameNeed(a: string, b: string) {
  const kb = new Set(variantKeys(b));
  return variantKeys(a).some((k) => kb.has(k));
}

/**
 * Groups words that share a key (union of overlapping groups). Each group of two or more
 * is returned with its words in input order.
 */
export function variantGroups<T extends { phrase: string }>(words: T[]): T[][] {
  const parent = words.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const owner = new Map<string, number>();
  words.forEach((w, i) => {
    for (const k of variantKeys(w.phrase)) {
      const j = owner.get(k);
      if (j === undefined) owner.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, T[]>();
  words.forEach((w, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), w]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}
