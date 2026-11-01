// New words (docs/product/keyword-pool.md#new-words): once a day, collect the queries
// rising under the root words, then measure and judge the newest and the due ones. Paid
// calls go through the new words' own daily budgets (budget.ts).
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  NEW_WORD_ORIGINS,
  newWordRoots,
  newWordRootScans,
  newWords,
  newWordSuggestions,
  poolRounds,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import type { WebOriginSearch } from "./adapters/claude-web-origin";
import type { Autocomplete } from "./adapters/google-autocomplete";
import type { NameSource } from "./adapters/name-sources";
import type { OriginEvidence, OriginSource } from "./adapters/origin-sources";
import type { RdapClient } from "./adapters/rdap";
import { registrableDomain } from "./adapters/rdap";
import type { Budget } from "./budget";
import type {
  Charged,
  KeywordIdea,
  KeywordProvider,
  Market,
  SerpItem,
} from "./keyword-provider";
import { newWordAnalysisSchema, type NewWordAnalyst } from "./new-word-analyst";
import {
  markEvidence,
  newWordOriginSchema,
  type NewWordOriginAnalyst,
  originWindow,
  serpMix,
} from "./new-word-origin";
import {
  type CurveFacts,
  curveFacts,
  dedicatedPages,
  NEW_SITE_DAYS,
  NEW_WORD_RULES,
  newWordVerdict,
  passesScreen,
  REFERENCE_TERM,
  splitComparison,
} from "./new-word-rules";
import { autoExclude } from "./pool-rules";
import { normalizePhrase, type PoolRound } from "./pool-service";
import { createProviderCache } from "./provider-cache";

const US: Market = { locationCode: 2840, languageCode: "en" };
/**
 * Root words whose rising queries are collected (NEW_WORD_ROOTS overrides them). Narrow
 * roots find product and game names; a broad one such as "ai" mostly finds news. A round
 * scans the ones scanned longest ago (rootsPerDay), so the list turns over in about a week:
 * a rising list covers 7 days, so a weekly scan misses little.
 */
export const DEFAULT_ROOTS = [
  // AI models and tools
  "ai",
  "model",
  "llm",
  "image",
  "video",
  "voice",
  "tts",
  "text to speech",
  "image generator",
  "video generator",
  "ai video",
  "ai image",
  "ai voice",
  "ai agent",
  "agent",
  "open source",
  "github",
  "api",
  "prompt",
  "chatbot",
  "gpt",
  "claude",
  "gemini",
  "deepseek",
  "qwen",
  "flux",
  "lora",
  "upscaler",
  "background remover",
  "face swap",
  "ocr",
  "transcribe",
  "translator",
  // Games
  "game",
  "codes",
  "roblox",
  "roblox codes",
  "script",
  "tycoon",
  "simulator",
  "tower defense",
  "obby",
  "idle game",
  "clicker",
  "mod",
  "update",
  "tier list",
  "wiki",
  "walkthrough",
  "steam",
  "demo",
  "unblocked",
  "io game",
  "puzzle",
  "wordle",
  "quiz",
  "crossword",
  "trello",
  "minecraft",
  "fortnite",
  "pokemon",
  // Tools
  "tool",
  "generator",
  "maker",
  "calculator",
  "checker",
  "converter",
  "template",
  "download",
  "downloader",
  "online",
  "free",
  "editor",
  "tracker",
  "finder",
  "planner",
  "test",
  "counter",
  "extension",
  "app",
  "website",
  "extractor",
  "compressor",
  "viewer",
  "randomizer",
  "name generator",
  "font",
  "emoji",
  "meme",
  "filter",
  "sticker",
  "wallpaper",
  "coloring page",
  "printable",
  "worksheet",
  "pdf",
  "svg",
  "qr code",
];
/** Roots scanned per round by default: $0.011 each. */
export const DEFAULT_ROOTS_PER_DAY = 15;
/** Names taken from each name source per round. */
export const NAMES_PER_SOURCE = 20;
/** Rising queries below this growth (percent) are noise. */
export const MIN_GROWTH = 200;
/** A word is measured again daily for this many checks, then left alone. */
export const MAX_CHECKS = 7;
export const STALE_ROUND_MS = 30 * 60 * 1000;
export const NEW_WORDS_PAGE_SIZE = 50;
const SERP_DEPTH = 20;
/** Labs for one keyword: $0.012 + $0.00012, reserved with room to spare. */
export const ONE_KEYWORD_RESERVE = 20_000;
const DAY_MS = 86_400_000;
const MAX_PHRASE = 100;
/** Words measured per Trends comparison: four and gpts, the most it takes. */
export const SCREEN_BATCH = 4;
/** Words screened per round by default: 10 comparisons, about $0.11. */
export const DEFAULT_SCREENS = 40;
/** Words whose origin is traced per round: worth and try ones, newest checks first. */
export const ORIGINS_PER_ROUND = 8;
/** Paid web searches per day, for words without free evidence. */
export const WEB_ORIGINS_PER_DAY = 3;
/** The source of a scan round: free sources only, every few hours (S73). */
export const SCAN_SOURCE = "scan";
export const SCAN_HOURS = 3;
/** Trending Now items taken per round, after dropping news categories. */
const TRENDING_PER_ROUND = 50;

export type NewWord = typeof newWords.$inferSelect;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type NewWordsReport = {
  roots: { root: string; rising: number }[];
  added: number;
  checked: { phrase: string; verdict: string | null; ratio: number | null }[];
  /** Words measured on the curve (step 1) and checked in depth (step 2); absent before S68. */
  screened?: number;
  deep?: number;
  budgetStopped: boolean;
  failures: string[];
  /** Words whose origin was traced; absent in reports from before S67. */
  origins?: number;
  /** Suggestions not seen before, added as new words this round. */
  suggestions?: number;
  /** Paid web searches for origins this round. */
  webSearches?: number;
  /** Names taken from each name source this round. */
  names?: Record<string, number>;
  /** Sources that failed this round, e.g. github. */
  sourceFailures?: string[];
};

class BudgetStop extends Error {}

/**
 * Where a word stands in the pipeline (S74): waiting for the maintainer, waiting for a deep
 * check, waiting for a screen, skipped, or hidden by the maintainer.
 */
export const NEW_WORD_STAGES = [
  "decide",
  "check",
  "screen",
  "skip",
  "hidden",
] as const;
export type NewWordStage = (typeof NEW_WORD_STAGES)[number];

const listQuery = z.object({
  stage: z.enum(NEW_WORD_STAGES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  verdict: z.enum(["worth", "try", "skip"]).optional().catch(undefined),
  category: z.string().max(20).optional().catch(undefined),
  origin: z.enum(NEW_WORD_ORIGINS).optional().catch(undefined),
  hidden: z.literal("1").optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export function createNewWords(deps: {
  database: Database;
  /** Needed to run rounds; the API only reads and queues. */
  provider?: KeywordProvider;
  analyst?: NewWordAnalyst;
  /** Free sources searched for a word's origin, and the analyst that reads them. */
  originSources?: OriginSource[];
  originAnalyst?: NewWordOriginAnalyst;
  /** A paid web search, only for words the free sources found nothing on. */
  webOrigin?: WebOriginSearch;
  rdap?: RdapClient;
  budget?: Budget;
  roots?: string[];
  /** Roots scanned per round, the longest unscanned first. */
  rootsPerDay?: number;
  /** Free lists of new names (Hugging Face, itch.io, Trending Now). */
  nameSources?: NameSource[];
  /** Google's suggestions for a root; new ones are new words (S73). */
  autocomplete?: Autocomplete;
  /** Pause between roots' suggestion calls, so Google does not throttle. */
  suggestDelayMs?: number;
  /** Words screened per day (step 1, cheap). */
  screensPerDay?: number;
  /** Words deep-checked per day (step 2: search results and volume). */
  checksPerDay?: number;
  now?: () => Date;
}) {
  const { database } = deps;
  // Rounds run in the worker, which always passes a provider.
  const providerOf = () => {
    if (!deps.provider) throw new Error("New words need a keyword provider");
    return deps.provider;
  };
  const now = deps.now ?? (() => new Date());
  const cache = createProviderCache({ database, now });
  const roots = deps.roots ?? DEFAULT_ROOTS;

  async function scheduleDaily(hourUtc: number) {
    const at = now();
    if (at.getUTCHours() < hourUtc) return null;
    const dayStart = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('new-words-daily-round'))`,
      );
      const [today] = await tx
        .select({ id: poolRounds.id })
        .from(poolRounds)
        .where(
          and(
            eq(poolRounds.kind, "new_words"),
            // Scans do not count: the paid daily round still runs once a day.
            sql`${poolRounds.source} is distinct from ${SCAN_SOURCE}`,
            sql`${poolRounds.createdAt} >= ${dayStart}`,
          ),
        )
        .limit(1);
      if (today) return null;
      const [round] = await tx
        .insert(poolRounds)
        .values({ kind: "new_words", createdAt: at })
        .returning();
      return round;
    });
  }

  /**
   * Queues a scan (S73) when no new-words round started in the last `hours`: free sources
   * only (Trending Now, new suggestions, name lists), then the day's remaining screens.
   */
  async function scheduleScan(hours = SCAN_HOURS) {
    const at = now();
    const since = new Date(at.getTime() - hours * 3_600_000);
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('new-words-scan-round'))`,
      );
      const [recent] = await tx
        .select({ id: poolRounds.id })
        .from(poolRounds)
        .where(
          and(
            eq(poolRounds.kind, "new_words"),
            sql`${poolRounds.createdAt} > ${since}`,
          ),
        )
        .limit(1);
      if (recent) return null;
      const [round] = await tx
        .insert(poolRounds)
        .values({ kind: "new_words", source: SCAN_SOURCE, createdAt: at })
        .returning();
      return round;
    });
  }

  /** What today's other new-words rounds used of the daily allowances. */
  async function usedToday(round: PoolRound) {
    const at = now();
    const dayStart = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    const [used] = await database
      .select({
        screened: sql<number>`coalesce(sum((${poolRounds.report}->>'screened')::int), 0)::int`,
        deep: sql<number>`coalesce(sum((${poolRounds.report}->>'deep')::int), 0)::int`,
        web: sql<number>`coalesce(sum((${poolRounds.report}->>'webSearches')::int), 0)::int`,
      })
      .from(poolRounds)
      .where(
        and(
          eq(poolRounds.kind, "new_words"),
          sql`${poolRounds.id} <> ${round.id}`,
          sql`${poolRounds.createdAt} >= ${dayStart}`,
        ),
      );
    return used;
  }

  async function failStale(olderThanMs = STALE_ROUND_MS) {
    return database
      .update(poolRounds)
      .set({
        status: "failed",
        errorCode: "ROUND_TIMED_OUT",
        finishedAt: now(),
      })
      .where(
        and(
          eq(poolRounds.status, "running"),
          eq(poolRounds.kind, "new_words"),
          lt(poolRounds.claimedAt, new Date(now().getTime() - olderThanMs)),
        ),
      )
      .returning({ id: poolRounds.id });
  }

  async function claim() {
    return database.transaction(async (tx) => {
      const [next] = await tx
        .select()
        .from(poolRounds)
        .where(
          and(
            eq(poolRounds.status, "queued"),
            eq(poolRounds.kind, "new_words"),
          ),
        )
        .orderBy(poolRounds.createdAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!next) return null;
      const [claimed] = await tx
        .update(poolRounds)
        .set({ status: "running", claimedAt: now() })
        .where(and(eq(poolRounds.id, next.id), eq(poolRounds.status, "queued")))
        .returning();
      return claimed ?? null;
    });
  }

  async function paid<T>(
    round: PoolRound,
    operation: "rising" | "compare" | "serp" | "suggestions",
    params: unknown,
    call: () => Promise<Charged<T>>,
    /** Reserve this much instead of the operation's maximum (a call of one keyword). */
    reserveMicros?: number,
  ): Promise<T> {
    const provider = providerOf();
    const ttl = provider.cacheTtlMs?.[operation];
    const request = { provider: provider.name, operation, market: US, params };
    if (ttl) {
      const hit = await cache.get<T>(request);
      if (hit) return hit.value;
    }
    if (!deps.budget) throw new BudgetStop();
    const charged = await deps.budget.charge(
      {
        projectId: null,
        poolRoundId: round.id,
        poolBudget: "new_words",
        runId: null,
        kind: "data",
        provider: provider.name,
        operation,
        maxCostMicros: reserveMicros ?? provider.maxCostMicros[operation] ?? 0,
      },
      call,
    );
    if (!charged) throw new BudgetStop();
    if (ttl) await cache.set(request, charged.value, ttl);
    return charged.value;
  }

  /** Adds a word, or marks it seen again, under a root or a name source. */
  async function record(
    phrase: string,
    root: string,
    growth: number | null,
    report: NewWordsReport,
  ) {
    const [word] = await database
      .insert(newWords)
      .values({
        phrase,
        firstSeenAt: now(),
        lastSeenAt: now(),
        nextCheckAt: now(),
      })
      .onConflictDoUpdate({
        target: newWords.phrase,
        set: { lastSeenAt: now() },
      })
      // xmax = 0: the row was inserted, not updated.
      .returning({ id: newWords.id, inserted: sql<boolean>`(xmax = 0)` });
    if (word.inserted) report.added++;
    await database
      .insert(newWordRoots)
      .values({ wordId: word.id, root, growth, seenAt: now() })
      .onConflictDoUpdate({
        target: [newWordRoots.wordId, newWordRoots.root],
        set: { growth, seenAt: now() },
      });
  }

  /** The roots scanned longest ago (never scanned first), in list order on a tie. */
  async function rootsForToday() {
    const scans = new Map(
      (await database.select().from(newWordRootScans)).map((r) => [
        r.root,
        r.scannedAt.getTime(),
      ]),
    );
    return roots
      .map((root, i) => ({ root, i, at: scans.get(root) ?? -1 }))
      .sort((a, b) => a.at - b.at || a.i - b.i)
      .slice(0, deps.rootsPerDay ?? DEFAULT_ROOTS_PER_DAY)
      .map((r) => r.root);
  }

  async function discover(round: PoolRound, report: NewWordsReport) {
    const provider = providerOf();
    const rising = provider.risingQueries?.bind(provider);
    // A scan uses free sources only; the paid rising queries run once a day.
    if (rising && round.source !== SCAN_SOURCE)
      for (const root of await rootsForToday()) {
        const queries = await paid(round, "rising", root, () =>
          rising(root, US),
        );
        const kept = queries.filter((q) => q.value >= MIN_GROWTH);
        report.roots.push({ root, rising: kept.length });
        for (const q of kept) {
          const phrase = normalizePhrase(q.query);
          if (!phrase || phrase.length > MAX_PHRASE || phrase === root)
            continue;
          await record(phrase, root, Math.round(q.value), report);
        }
        await database
          .insert(newWordRootScans)
          .values({ root, scannedAt: now(), rising: kept.length })
          .onConflictDoUpdate({
            target: newWordRootScans.root,
            set: { scannedAt: now(), rising: kept.length },
          });
      }
    // Names from free lists: no growth figure; the screen measures them like the rest.
    for (const source of deps.nameSources ?? []) {
      const names = await source
        .names(
          source.name === "trending_now"
            ? TRENDING_PER_ROUND
            : NAMES_PER_SOURCE,
        )
        .catch((error: unknown) => {
          logger.warn("newwords.name_source_failed", {
            source: source.name,
            error,
          });
          report.sourceFailures = [
            ...(report.sourceFailures ?? []),
            source.name,
          ];
          return [];
        });
      for (const name of names) {
        const phrase = normalizePhrase(name);
        if (!phrase || phrase.length > MAX_PHRASE) continue;
        await record(phrase, `source:${source.name}`, null, report);
      }
      report.names = { ...report.names, [source.name]: names.length };
    }
    await newSuggestions(report);
  }

  /**
   * Google's suggestions for each root, against those seen before: a new one is a new
   * word, often before it shows in Trends. A root's first scan only records its baseline.
   */
  async function newSuggestions(report: NewWordsReport) {
    const suggest = deps.autocomplete;
    if (!suggest) return;
    let added = 0;
    for (const root of roots) {
      const phrases = [
        ...new Set(
          (await suggest(root).catch(() => [] as string[]))
            .map((p) => normalizePhrase(p))
            .filter(
              (p): p is string => !!p && p !== root && p.length <= MAX_PHRASE,
            ),
        ),
      ];
      if (phrases.length === 0) continue;
      const [known] = await database
        .select({ n: count() })
        .from(newWordSuggestions)
        .where(eq(newWordSuggestions.root, root));
      const fresh = await database
        .insert(newWordSuggestions)
        .values(phrases.map((phrase) => ({ root, phrase, firstSeenAt: now() })))
        .onConflictDoNothing()
        .returning({ phrase: newWordSuggestions.phrase });
      if (known.n > 0)
        for (const f of fresh) {
          await record(f.phrase, `suggest:${root}`, null, report);
          added++;
        }
      if (deps.suggestDelayMs) await sleep(deps.suggestDelayMs);
    }
    report.suggestions = added;
  }

  async function newSitesOf(serp: SerpItem[]) {
    if (!deps.rdap) return null;
    const domains = [
      ...new Set(
        serp
          .slice(0, 10)
          .map((r) => r.site)
          .filter((s) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s))
          .map(registrableDomain),
      ),
    ];
    const ages = await Promise.all(
      domains.map((d) => deps.rdap!.registeredOn(d)),
    );
    const since = new Date(now().getTime() - NEW_SITE_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return ages.filter((a) => a.registeredOn && a.registeredOn >= since);
  }

  async function analyse(
    round: PoolRound,
    word: NewWord,
    serp: SerpItem[],
    buildAs: "new_site" | "inner_page" | null,
  ) {
    const { analyst, budget } = deps;
    if (!analyst || !budget) return null;
    const wordRoots = (
      await database
        .select({ root: newWordRoots.root })
        .from(newWordRoots)
        .where(eq(newWordRoots.wordId, word.id))
    ).map((r) => r.root);
    const charged = await budget.charge(
      {
        projectId: null,
        poolRoundId: round.id,
        poolBudget: "new_words",
        runId: null,
        kind: "ai",
        provider: analyst.name,
        operation: "analyze",
        maxCostMicros: analyst.maxCostMicros,
      },
      () =>
        analyst.analyze({
          phrase: word.phrase,
          roots: wordRoots,
          titles: serp.slice(0, 10).map((r) => r.title),
          buildAs,
        }),
    );
    if (!charged) return null;
    const parsed = newWordAnalysisSchema.safeParse(charged.value);
    return parsed.success ? parsed.data : null;
  }

  const yes = (b: boolean) => (b ? "yes" : "no") as "yes" | "no";

  // Step 1, the screen: one Trends comparison measures four words against gpts over 90
  // days ($0.011 for four). A word that is too cold, falling or excluded stops here.
  async function screen(round: PoolRound, words: NewWord[]) {
    const provider = providerOf();
    const compare = provider.trendCompare?.bind(provider);
    const facts = new Map<string, CurveFacts>();
    const measure = async (batch: NewWord[]) => {
      const phrases = [...batch.map((w) => w.phrase), REFERENCE_TERM];
      return compare
        ? await paid(round, "compare", { phrases, range: "past_90_days" }, () =>
            compare(phrases, US, "past_90_days"),
          )
        : [];
    };
    for (let i = 0; i < words.length; i += SCREEN_BATCH) {
      const batch = words.slice(i, i + SCREEN_BATCH);
      const comparison = await measure(batch);
      const ref = batch.length;
      const refPeak = Math.max(0, ...comparison.map((p) => p.values[ref] ?? 0));
      batch.forEach((w, k) =>
        facts.set(w.id, curveFacts(splitComparison(comparison, k, ref))),
      );
      // A word louder than gpts sets the scale and can round the others down to 0:
      // measure those alone.
      const loud = batch.some(
        (_, k) =>
          Math.max(0, ...comparison.map((p) => p.values[k] ?? 0)) > refPeak,
      );
      if (!loud || batch.length === 1) continue;
      for (const w of batch.filter((w) => facts.get(w.id)!.peakDay === null))
        facts.set(w.id, curveFacts(await measure([w])));
    }
    return facts;
  }

  /** Saves the curve facts of a screen; a word that does not pass is judged here. */
  async function saveScreen(word: NewWord, facts: CurveFacts, passed: boolean) {
    const checks = word.checks + 1;
    const verdict = passed
      ? null
      : newWordVerdict({
          phrase: word.phrase,
          ratio: facts.ratio,
          dedicated: null,
          rising: facts.rising,
          isNew: facts.isNew,
          spike: facts.spike,
        });
    await database
      .update(newWords)
      .set({
        curve: facts.days,
        // Fixed at the first measurement: 10% of a still-growing peak moves later each day.
        burstDay: word.burstDay ?? facts.burstDay,
        peakDay: facts.peakDay,
        firstDay: facts.firstDay,
        growth7: facts.growth7,
        spike: yes(facts.spike),
        isNew: yes(facts.isNew),
        fromZero: yes(facts.fromZero),
        rising: yes(facts.rising),
        preBurstShare: facts.preBurstShare,
        ratio: facts.ratio,
        ratioDay: facts.ratioDay,
        ...(verdict && {
          verdict: verdict.verdict,
          buildAs: verdict.buildAs,
          reasons: verdict.reasons,
          rules: NEW_WORD_RULES,
        }),
        checkedAt: now(),
        checks,
        // Measured daily for a week while it rises; a word that stopped is left alone.
        nextCheckAt:
          checks < MAX_CHECKS && facts.rising
            ? new Date(now().getTime() + DAY_MS)
            : null,
      })
      .where(eq(newWords.id, word.id));
    return verdict?.verdict ?? null;
  }

  // Step 2, the deep check of a word that passed the screen: the top 20, its search
  // volume, new sites on page one and the explanation. Cached for days, so a recheck of
  // the same word costs little.
  async function deepCheck(round: PoolRound, word: NewWord, facts: CurveFacts) {
    const provider = providerOf();
    const serp = await paid(
      round,
      "serp",
      { phrase: word.phrase, depth: SERP_DEPTH },
      () => provider.serp(word.phrase, US, SERP_DEPTH),
    );
    const dedicated = dedicatedPages(word.phrase, serp);
    const suggestions = provider.suggestions?.bind(provider);
    const band = { minVolume: 0, limit: 1 };
    const ideas: KeywordIdea[] = suggestions
      ? await paid(
          round,
          "suggestions",
          { seed: word.phrase, ...band },
          () => suggestions(word.phrase, US, band),
          ONE_KEYWORD_RESERVE,
        )
      : [];
    const metrics = ideas.find((i) => i.phrase === word.phrase)?.metrics;
    const verdict = newWordVerdict({
      phrase: word.phrase,
      ratio: facts.ratio,
      dedicated,
      rising: facts.rising,
      isNew: facts.isNew,
      spike: facts.spike,
    });
    const newSites = await newSitesOf(serp);
    const analysis = word.about
      ? null
      : await analyse(round, word, serp, verdict.buildAs);
    await database
      .update(newWords)
      .set({
        searchVolume: metrics?.searchVolume ?? null,
        keywordDifficulty: metrics?.keywordDifficulty ?? null,
        cpcMicros: metrics?.cpcMicros ?? null,
        dedicatedPages: dedicated,
        serp: serp.map(({ rank, site, url, title }) => ({
          rank,
          site,
          url,
          title,
        })),
        ...(newSites && { newSites }),
        verdict: verdict.verdict,
        buildAs: verdict.buildAs,
        reasons: verdict.reasons,
        rules: NEW_WORD_RULES,
        ...(analysis && analysis),
      })
      .where(eq(newWords.id, word.id));
    return verdict.verdict;
  }

  /** Screens the due words, then deep-checks the warmest that passed. */
  async function measure(round: PoolRound, report: NewWordsReport) {
    // The allowances are per day; scans every few hours share them.
    const used = await usedToday(round);
    const screens = Math.max(
      0,
      (deps.screensPerDay ?? DEFAULT_SCREENS) - used.screened,
    );
    const deepLeft = Math.max(0, (deps.checksPerDay ?? 12) - used.deep);
    const due = await database
      .select()
      .from(newWords)
      .where(and(isNull(newWords.hiddenAt), lte(newWords.nextCheckAt, now())))
      // Never measured first, newest first; then the rest by when they are due.
      .orderBy(
        sql`${newWords.checkedAt} is not null`,
        desc(newWords.firstSeenAt),
        asc(newWords.nextCheckAt),
      )
      .limit(screens);
    // Excluded words (downloads, shopping, offline) need no data at all.
    const excluded = due.filter((w) => autoExclude(w.phrase));
    for (const word of excluded) {
      const verdict = newWordVerdict({
        phrase: word.phrase,
        ratio: null,
        dedicated: null,
        rising: false,
        isNew: false,
      });
      await database
        .update(newWords)
        .set({
          verdict: verdict.verdict,
          buildAs: null,
          reasons: verdict.reasons,
          rules: NEW_WORD_RULES,
          checkedAt: now(),
          checks: word.checks + 1,
          nextCheckAt: null,
        })
        .where(eq(newWords.id, word.id));
      report.checked.push({
        phrase: word.phrase,
        verdict: "skip",
        ratio: null,
      });
    }
    const toScreen = due.filter((w) => !autoExclude(w.phrase));
    const facts = await screen(round, toScreen);
    const passed: NewWord[] = [];
    for (const word of toScreen) {
      const f = facts.get(word.id)!;
      const ok = passesScreen({
        phrase: word.phrase,
        ratio: f.ratio,
        rising: f.rising,
      });
      const verdict = await saveScreen(word, f, ok);
      report.screened = (report.screened ?? 0) + 1;
      if (ok) passed.push(word);
      else
        report.checked.push({ phrase: word.phrase, verdict, ratio: f.ratio });
    }
    // The warmest first: the deep checks are the costly part.
    passed.sort(
      (a, b) => (facts.get(b.id)!.ratio ?? 0) - (facts.get(a.id)!.ratio ?? 0),
    );
    for (const word of passed.slice(0, deepLeft)) {
      const f = facts.get(word.id)!;
      try {
        const verdict = await deepCheck(round, word, f);
        report.deep = (report.deep ?? 0) + 1;
        report.checked.push({ phrase: word.phrase, verdict, ratio: f.ratio });
      } catch (error) {
        if (error instanceof BudgetStop) throw error;
        logger.warn("newwords.check_failed", {
          roundId: round.id,
          phrase: word.phrase,
          error,
        });
        report.failures.push(word.phrase);
      }
    }
    // Passed but over today's deep checks: measured again tomorrow, deep-checked then.
    const waiting = passed.slice(deepLeft).map((w) => w.id);
    if (waiting.length)
      await database
        .update(newWords)
        .set({ nextCheckAt: new Date(now().getTime() + DAY_MS) })
        .where(inArray(newWords.id, waiting));
  }

  // Why a worth or try word rose: search the free sources around its burst, then let the
  // analyst read the evidence with the stored top results. Only the reading is paid.
  async function traceOrigins(round: PoolRound, report: NewWordsReport) {
    const { originSources, originAnalyst, budget, webOrigin } = deps;
    let webSearches = 0;
    const webAllowance = Math.max(
      0,
      WEB_ORIGINS_PER_DAY - (await usedToday(round)).web,
    );
    if (!originSources?.length || !originAnalyst || !budget) return;
    const words = await database
      .select()
      .from(newWords)
      .where(
        and(
          isNull(newWords.hiddenAt),
          isNull(newWords.originCheckedAt),
          inArray(newWords.verdict, ["worth", "try"]),
        ),
      )
      .orderBy(desc(newWords.checkedAt))
      .limit(ORIGINS_PER_ROUND);
    const failed = new Set<string>();
    for (const word of words) {
      const window = originWindow(word.burstDay, word.firstSeenAt, now());
      const evidence: OriginEvidence[] = [];
      for (const source of originSources) {
        const found = await source
          .search(word.phrase, window)
          .catch((error: unknown) => {
            logger.warn("newwords.origin_source_failed", {
              source: source.name,
              phrase: word.phrase,
              error,
            });
            failed.add(source.name);
            return [];
          });
        evidence.push(...found);
      }
      // Nothing in the free sources: games, holidays and social media trends live on the
      // open web. One paid search, a few per day; a short budget only skips it.
      if (evidence.length === 0 && webOrigin && webSearches < webAllowance) {
        webSearches++;
        const found = await budget
          .charge(
            {
              projectId: null,
              poolRoundId: round.id,
              poolBudget: "new_words",
              runId: null,
              kind: "ai",
              provider: "anthropic",
              operation: "origin_search",
              maxCostMicros: webOrigin.maxCostMicros,
            },
            () =>
              webOrigin.search(word.phrase, {
                ...window,
                burstDay: word.burstDay,
              }),
          )
          .catch((error: unknown) => {
            logger.warn("newwords.web_origin_failed", {
              phrase: word.phrase,
              error,
            });
            failed.add("web");
            return null;
          });
        if (found) {
          evidence.push(...found.value);
          report.webSearches = (report.webSearches ?? 0) + 1;
        }
      }
      // Dated items in order; items without a date after them.
      evidence.sort(
        (a, b) => Number(!a.at) - Number(!b.at) || a.at.localeCompare(b.at),
      );
      const serp = (word.serp ?? []) as { site: string; title: string }[];
      const charged = await budget.charge(
        {
          projectId: null,
          poolRoundId: round.id,
          poolBudget: "new_words",
          runId: null,
          kind: "ai",
          provider: originAnalyst.name,
          operation: "origin",
          maxCostMicros: originAnalyst.maxCostMicros,
        },
        () =>
          originAnalyst.analyze({
            phrase: word.phrase,
            burstDay: word.burstDay,
            firstSeen: word.firstSeenAt.toISOString().slice(0, 10),
            evidence: evidence.map((e, i) => ({ ...e, i })),
            serp: serp.slice(0, 10).map(({ site, title }) => ({ site, title })),
            serpMix: serpMix(serp),
          }),
      );
      if (!charged) throw new BudgetStop();
      const parsed = newWordOriginSchema.safeParse(charged.value);
      if (!parsed.success) {
        logger.warn("newwords.origin_invalid", { phrase: word.phrase });
        continue;
      }
      await database
        .update(newWords)
        .set({
          originType: parsed.data.originType,
          originSummary: parsed.data.summary,
          originCapture: parsed.data.capture,
          originEvidence: markEvidence(evidence, parsed.data),
          originCheckedAt: now(),
        })
        .where(eq(newWords.id, word.id));
      report.origins = (report.origins ?? 0) + 1;
    }
    if (failed.size) report.sourceFailures = [...failed];
  }

  async function run(round: PoolRound) {
    const report: NewWordsReport = {
      roots: [],
      added: 0,
      checked: [],
      budgetStopped: false,
      failures: [],
      screened: 0,
      deep: 0,
      origins: 0,
    };
    try {
      await discover(round, report);
      await measure(round, report);
      await traceOrigins(round, report);
    } catch (error) {
      if (!(error instanceof BudgetStop)) {
        logger.error("newwords.round_failed", { roundId: round.id, error });
        return finish(round, "failed", report, "ROUND_FAILED");
      }
      report.budgetStopped = true;
    }
    const nothing = report.roots.length === 0 && report.checked.length === 0;
    const status =
      report.budgetStopped && nothing
        ? "budget_exhausted"
        : report.budgetStopped || report.failures.length > 0
          ? "partial"
          : "completed";
    return finish(
      round,
      status,
      report,
      report.budgetStopped ? "DAILY_BUDGET_EXHAUSTED" : null,
    );
  }

  async function finish(
    round: PoolRound,
    status: PoolRound["status"],
    report: NewWordsReport,
    errorCode: string | null,
  ) {
    const [done] = await database
      .update(poolRounds)
      .set({ status, report, errorCode, finishedAt: now() })
      .where(and(eq(poolRounds.id, round.id), eq(poolRounds.status, "running")))
      .returning();
    logger.info("newwords.round_finished", { roundId: round.id, status });
    return done ?? round;
  }

  /** Asks the worker for a new-words round now; an unfinished one is returned instead. */
  async function requestRound(userId: string) {
    const [open] = await database
      .select()
      .from(poolRounds)
      .where(
        and(
          eq(poolRounds.kind, "new_words"),
          inArray(poolRounds.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (open) return { round: open, created: false };
    const [round] = await database
      .insert(poolRounds)
      .values({ kind: "new_words", requestedBy: userId, createdAt: now() })
      .returning();
    return { round, created: true };
  }

  // Long tails: other words that contain this one as whole words. The outer row is named
  // in full: inside the subquery an unqualified column would be the inner one.
  const innerCandidates = sql<number>`(select count(*)::int from new_words c where c.id <> "new_words"."id" and (' ' || c.phrase || ' ') like ('% ' || "new_words"."phrase" || ' %'))`;

  async function list(query: Record<string, string | undefined>) {
    const { stage, q, verdict, category, origin, hidden, page } =
      listQuery.parse(query);
    const visible = isNull(newWords.hiddenAt);
    const stageWhere: Record<NewWordStage, SQL | undefined> = {
      decide: and(visible, inArray(newWords.verdict, ["worth", "try"])),
      check: and(
        visible,
        isNull(newWords.verdict),
        sql`${newWords.ratio} is not null`,
      ),
      screen: and(visible, isNull(newWords.verdict), isNull(newWords.ratio)),
      skip: and(visible, eq(newWords.verdict, "skip")),
      hidden: sql`${newWords.hiddenAt} is not null`,
    };
    // The search and the origin narrow every stage, so the counts follow them.
    const base = and(
      q ? sql`${newWords.phrase} ilike ${`%${q}%`}` : undefined,
      category ? sql`${newWords.category} = ${category}` : undefined,
      origin ? eq(newWords.originType, origin) : undefined,
    );
    const where = and(
      base,
      stage ? stageWhere[stage] : hidden ? stageWhere.hidden : visible,
      verdict ? eq(newWords.verdict, verdict) : undefined,
    );
    const order =
      stage === "decide"
        ? [
            sql`case ${newWords.verdict} when 'worth' then 0 else 1 end`,
            desc(newWords.firstSeenAt),
          ]
        : stage === "check"
          ? [sql`${newWords.ratio} desc nulls last`, desc(newWords.firstSeenAt)]
          : [desc(newWords.firstSeenAt), desc(newWords.ratio)];
    const [rows, [{ total }], [counts], originRows] = await Promise.all([
      database
        .select({ word: newWords, innerCandidates })
        .from(newWords)
        .where(where)
        .orderBy(...order)
        .limit(NEW_WORDS_PAGE_SIZE)
        .offset((page - 1) * NEW_WORDS_PAGE_SIZE),
      database.select({ total: count() }).from(newWords).where(where),
      database
        .select(
          Object.fromEntries(
            NEW_WORD_STAGES.map((s) => [
              s,
              sql<number>`count(*) filter (where ${stageWhere[s]})`.mapWith(
                Number,
              ),
            ]),
          ) as Record<NewWordStage, SQL<number>>,
        )
        .from(newWords)
        .where(base),
      database
        .select({ origin: newWords.originType, n: count() })
        .from(newWords)
        .where(
          and(
            visible,
            q ? sql`${newWords.phrase} ilike ${`%${q}%`}` : undefined,
            sql`${newWords.originType} is not null`,
          ),
        )
        .groupBy(newWords.originType),
    ]);
    const ids = rows.map((r) => r.word.id);
    const rootRows = ids.length
      ? await database
          .select()
          .from(newWordRoots)
          .where(inArray(newWordRoots.wordId, ids))
      : [];
    return {
      total,
      page,
      counts,
      origins: Object.fromEntries(
        originRows.map((r) => [r.origin as string, r.n]),
      ) as Record<string, number>,
      items: rows.map((r) => ({
        ...r,
        roots: rootRows.filter((x) => x.wordId === r.word.id),
      })),
    };
  }

  const notFound = () =>
    new AppError("NEW_WORD_NOT_FOUND", "New word not found");

  async function get(id: string) {
    if (!z.uuid().safeParse(id).success) throw notFound();
    const [row] = await database
      .select({ word: newWords, innerCandidates })
      .from(newWords)
      .where(eq(newWords.id, id));
    if (!row) throw notFound();
    const [wordRoots, children] = await Promise.all([
      database.select().from(newWordRoots).where(eq(newWordRoots.wordId, id)),
      database
        .select()
        .from(newWords)
        // Its long tails: words that contain it as whole words, each an inner page.
        .where(
          sql`${newWords.phrase} <> ${row.word.phrase} and (' ' || ${newWords.phrase} || ' ') like ('% ' || ${row.word.phrase} || ' %')`,
        )
        .orderBy(desc(newWords.rising), desc(newWords.ratio))
        .limit(50),
    ]);
    return { ...row, roots: wordRoots, children };
  }

  /** The maintainer chooses to build for a word; the API starts its product. */
  async function select(id: string) {
    const { word } = await get(id);
    if (word.selectedAt) return word;
    const [selected] = await database
      .update(newWords)
      .set({ selectedAt: now() })
      .where(eq(newWords.id, id))
      .returning();
    return selected;
  }

  async function hide(id: string, hidden: boolean) {
    await get(id);
    const [word] = await database
      .update(newWords)
      .set({ hiddenAt: hidden ? now() : null })
      .where(eq(newWords.id, id))
      .returning();
    return word;
  }

  /** What the discover tab counts: words not hidden. */
  async function visibleCount() {
    const [{ n }] = await database
      .select({ n: count() })
      .from(newWords)
      .where(isNull(newWords.hiddenAt));
    return n;
  }

  return {
    visibleCount,
    scheduleDaily,
    scheduleScan,
    failStale,
    claim,
    run,
    requestRound,
    list,
    get,
    select,
    hide,
  };
}
