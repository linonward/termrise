import type { ClusterEvidence } from "./scoring";

// What to build for an opportunity (docs/architecture/data-model.md#opportunities): a new
// site around the keyword, a page on an existing site, or nothing yet. Rules only, from
// search volume, KD and the pages already made for the keyword; versioned.
export const BUILD_ADVICE_VERSION = "build-v1";

export const NEW_SITE_MIN_VOLUME = 1000;
export const NEW_SITE_MAX_KD = 40;
export const NEW_SITE_MAX_DEDICATED = 3;
export const MIN_VOLUME = 100;

export type BuildAdvice = {
  version: typeof BUILD_ADVICE_VERSION;
  advice: "new_site" | "inner_page" | "weak_demand" | "unknown";
  /** Why, as codes the UI translates; each names the number it rests on. */
  reasons: (
    | "no_volume"
    | "volume_low"
    | "volume_mid"
    | "volume_high"
    | "kd_low"
    | "kd_high"
    | "kd_missing"
    | "no_serp"
    | "dedicated_few"
    | "dedicated_many"
  )[];
};

export function buildAdvice(evidence: ClusterEvidence): BuildAdvice {
  const strongest = [...evidence.keywords]
    .filter((k) => k.searchVolume !== null)
    .sort((a, b) => b.searchVolume! - a.searchVolume!)[0];
  const advise = (
    advice: BuildAdvice["advice"],
    reasons: BuildAdvice["reasons"],
  ): BuildAdvice => ({ version: BUILD_ADVICE_VERSION, advice, reasons });
  if (!strongest) return advise("unknown", ["no_volume"]);
  const volume = strongest.searchVolume!;
  if (volume < MIN_VOLUME) return advise("weak_demand", ["volume_low"]);

  const reasons: BuildAdvice["reasons"] = [
    volume >= NEW_SITE_MIN_VOLUME ? "volume_high" : "volume_mid",
  ];
  const kd = strongest.keywordDifficulty;
  reasons.push(
    kd === null ? "kd_missing" : kd <= NEW_SITE_MAX_KD ? "kd_low" : "kd_high",
  );
  const dedicated = evidence.serp?.dedicatedPages;
  reasons.push(
    dedicated === undefined
      ? "no_serp"
      : dedicated <= NEW_SITE_MAX_DEDICATED
        ? "dedicated_few"
        : "dedicated_many",
  );
  // A new site needs the demand, a beatable KD and room in the top results.
  const newSite =
    volume >= NEW_SITE_MIN_VOLUME &&
    kd !== null &&
    kd <= NEW_SITE_MAX_KD &&
    dedicated !== undefined &&
    dedicated <= NEW_SITE_MAX_DEDICATED;
  return advise(newSite ? "new_site" : "inner_page", reasons);
}
