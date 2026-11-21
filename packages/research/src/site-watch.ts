// Watched sites (docs/product/keyword-pool.md#site-watch): sections of other sites, such
// as imagelayered.com/tools/ or a blog category, whose new pages hint at new searches. A
// scan reads each section's feed, sitemap or links (all free), keeps what is new since
// the first scan, and turns each new page into a search phrase for the new words (S83).
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  newWords,
  WATCH_ROLES,
  watchPages,
  watchSources,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import type { NameItem } from "./adapters/name-sources";

const UA = "termrise-site-watch/1.0 (+https://termrise.com)";
/** New pages that get a title fetched per section and scan; the rest keep their address. */
const TITLES_PER_SCAN = 20;
/** Child sitemaps read from a sitemap index. */
const MAX_CHILD_SITEMAPS = 30;
export const MAX_WATCH_SOURCES = 50;
const MAX_PHRASE_WORDS = 10;

export type WatchedPage = {
  url: string;
  title: string | null;
  publishedAt: Date | null;
};

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&#8217;/g, "'")
    .trim();

const date = (s: string | undefined) => {
  if (!s) return null;
  const d = new Date(decode(s));
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * A section's address: https, lower-case host, no query or fragment, ending in "/".
 * "imagelayered.com/tools" becomes "https://imagelayered.com/tools/". Null when not a site.
 */
export function normalizePrefix(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(url.hostname)) return null;
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return `https://${url.hostname}${path}`;
}

/** The address without scheme and "www.", for comparing a page with its section. */
const bare = (u: string) =>
  u.replace(/^https?:\/\//i, "").replace(/^www\./i, "");

/** A page in the section: below the prefix, not the prefix, a page list or a feed. */
export function inSection(url: string, prefix: string) {
  const u = bare(url.split(/[?#]/)[0]);
  const p = bare(prefix);
  if (!u.toLowerCase().startsWith(p.toLowerCase())) return false;
  const rest = u.slice(p.length).replace(/\/$/, "");
  if (!rest) return false;
  return !/(^|\/)(page\/\d+|feed|tag|tags|category|author)(\/|$)/i.test(rest);
}

/**
 * A feed's pages that belong to the section. A feed of the section itself (its address
 * starts with the section, like a blog category's /feed/) lists posts that may live
 * elsewhere on the site (/blog/ai/ lists /blog/<post>/): every page on the site counts.
 */
export function feedPages(xml: string, feedUrl: string, prefix: string) {
  const own = bare(feedUrl).startsWith(bare(prefix));
  const host = bare(prefix).split("/")[0];
  return parseFeed(xml).filter((p) =>
    own
      ? bare(p.url).split("/")[0] === host &&
        bare(p.url).replace(/\/$/, "") !== bare(prefix).replace(/\/$/, "")
      : inSection(p.url, prefix),
  );
}

/** Items of an RSS or Atom feed. */
export function parseFeed(xml: string): WatchedPage[] {
  const out: WatchedPage[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const item = m[0];
    const link = /<link>([\s\S]*?)<\/link>/i.exec(item)?.[1];
    if (!link) continue;
    out.push({
      url: decode(link),
      title: (() => {
        const t = /<title>([\s\S]*?)<\/title>/i.exec(item)?.[1];
        return t ? decode(t) : null;
      })(),
      publishedAt: date(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1]),
    });
  }
  for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const entry = m[0];
    const link =
      /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(
        entry,
      )?.[1] ?? /<link[^>]*href=["']([^"']+)["']/i.exec(entry)?.[1];
    if (!link) continue;
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(entry)?.[1];
    out.push({
      url: decode(link),
      title: t ? decode(t) : null,
      publishedAt: date(
        /<(?:published|updated)>([\s\S]*?)<\/(?:published|updated)>/i.exec(
          entry,
        )?.[1],
      ),
    });
  }
  return out;
}

/** A sitemap's pages, or a sitemap index's child sitemaps. */
export function parseSitemap(xml: string): {
  pages: WatchedPage[];
  children: string[];
} {
  if (/<sitemapindex\b/i.test(xml))
    return {
      pages: [],
      children: [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((m) =>
        decode(m[1]),
      ),
    };
  return {
    pages: [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].flatMap((m) => {
      const loc = /<loc>([\s\S]*?)<\/loc>/i.exec(m[1])?.[1];
      if (!loc) return [];
      return [
        {
          url: decode(loc),
          title: null,
          publishedAt: date(/<lastmod>([\s\S]*?)<\/lastmod>/i.exec(m[1])?.[1]),
        },
      ];
    }),
    children: [],
  };
}

/** The feeds a page announces in its head. */
export function feedLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']alternate["']/i.test(tag)) continue;
    if (!/type=["']application\/(rss|atom)\+xml["']/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      out.push(new URL(decode(href), base).toString());
    } catch {
      // A broken href is skipped.
    }
  }
  return out;
}

/** Links on a page that point into the section, once each. */
export function sectionLinks(html: string, prefix: string): WatchedPage[] {
  const seen = new Set<string>();
  const out: WatchedPage[] = [];
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let url: string;
    try {
      url = new URL(decode(m[1]), prefix).toString().split(/[?#]/)[0];
    } catch {
      continue;
    }
    if (!inSection(url, prefix) || seen.has(bare(url))) continue;
    seen.add(bare(url));
    out.push({ url, title: null, publishedAt: null });
  }
  return out;
}

const LEADING = [
  /^how to (make|create|generate|build|get|use|do|turn|try) (an? |the |your )?/,
  /^how to /,
  /^what is (an? |the )?/,
  /^(the )?best /,
  /^top \d+ /,
  /^free /,
  /^effects? /,
  /^awesome /,
];
const TRAILING =
  /( (generator|maker|creator|editor|online|free|tool|tools|app|guide|tutorial|prompts?|template|templates|trends?|for free|in \d+ steps?|\d{4}))+$/;

/** A language folder such as "jp", "ko" or "pt-br": not part of a page's name. */
const LOCALE = /^[a-z]{2}(-[a-z]{2,4})?$/i;

/**
 * The search a page targets, from its address ("goodbye-gta-5-ai-video-generator" →
 * "goodbye gta 5 ai video"), or from its title when the address is an id. Under a
 * section, the first folder after it names the page (/trends/<name>/watch); language
 * folders are skipped. Lower case; null when nothing usable is left.
 */
export function phraseFromPage(
  url: string,
  title: string | null,
  prefix?: string,
) {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const segments = path.split("/").filter(Boolean);
  let below: string[] = [];
  if (
    prefix &&
    bare(url).toLowerCase().startsWith(bare(prefix).toLowerCase())
  ) {
    const depth = new URL(prefix).pathname.split("/").filter(Boolean).length;
    below = segments.slice(depth).filter((x) => !LOCALE.test(x));
  }
  const slug = decodeURIComponent(
    // The first folder that reads as a name (two words or more): /showcase/ and /app/
    // are folders, the page's name is below them.
    below.find((x) => x.split(/[-_+]/).filter(Boolean).length >= 2) ??
      segments.filter((x) => !LOCALE.test(x)).pop() ??
      "",
  ).replace(/\.(html?|php|aspx?)$/i, "");
  const words = slug.split(/[-_+\s]+/).filter(Boolean);
  const fromSlug =
    words.length >= 2 && words.filter((w) => /[a-z]/i.test(w)).length >= 2
      ? words.join(" ")
      : null;
  const fromTitle = title
    ? title.split(/ [|\-–—:] /)[0].replace(/[^\p{L}\p{N}.' ]+/gu, " ")
    : null;
  let phrase = (fromSlug ?? fromTitle ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  // An id at the end of a slug ("…-a1b2c3d4") is not part of the search.
  phrase = phrase.replace(/ (?=[a-z]*\d)[a-z0-9]{6,}$/, "");
  for (const re of LEADING) phrase = phrase.replace(re, "");
  phrase = phrase.replace(TRAILING, "").trim();
  // "mai image 2.7 image generator": the last word repeats one before it.
  const parts = phrase.split(" ");
  if (parts.length > 2 && parts.slice(0, -1).includes(parts.at(-1)!))
    phrase = parts.slice(0, -1).join(" ");
  const n = phrase.split(" ").filter(Boolean).length;
  if (n < 1 || n > MAX_PHRASE_WORDS || phrase.length < 3) return null;
  return phrase;
}

/** Words that every effect page shares: they say nothing about which trend it is. */
const GENERIC = new Set(
  "ai video videos image images photo photos picture effect effects generator maker free online the a an to of and with in for on your my inspired style filter template templates prompt prompts trend trends app tool".split(
    " ",
  ),
);
const tokens = (phrase: string) =>
  new Set(phrase.split(" ").filter((w) => w && !GENERIC.has(w)));

/**
 * Two phrases name the same trend: their telling words are the same, or one's are all in
 * the other's and there are at least two ("goodbye gta 5 ai video" and "gta 5 goodbye
 * farewell video"). One telling word must match exactly.
 */
export function samePhrase(a: string, b: string) {
  return sameTokens(tokens(a), tokens(b));
}

function sameTokens(ta: Set<string>, tb: Set<string>) {
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const w of small) if (!big.has(w)) return false;
  return small.size >= 2 || small.size === big.size;
}

type Fetcher = typeof fetch;

async function getText(fetcher: Fetcher, url: string) {
  const res = await fetcher(url, {
    headers: { "user-agent": UA, accept: "*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`http ${res.status} ${url}`);
  return res.text();
}

/** The page title, or null; a failure is not an error. */
async function titleOf(fetcher: Fetcher, url: string) {
  try {
    const html = (await getText(fetcher, url)).slice(0, 200_000);
    const m = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html);
    return m ? decode(m[1]).replace(/\s+/g, " ") : null;
  } catch {
    return null;
  }
}

/** Pages of the section from a list of sitemaps (an index is opened once). */
async function fromSitemaps(
  fetcher: Fetcher,
  sitemaps: string[],
  prefix: string,
) {
  const used: string[] = [];
  const pages: WatchedPage[] = [];
  const queue = [...sitemaps];
  let opened = 0;
  while (queue.length && opened < MAX_CHILD_SITEMAPS + sitemaps.length) {
    const url = queue.shift()!;
    opened += 1;
    let parsed: ReturnType<typeof parseSitemap>;
    try {
      parsed = parseSitemap(await getText(fetcher, url));
    } catch {
      continue;
    }
    queue.push(...parsed.children.slice(0, MAX_CHILD_SITEMAPS));
    const mine = parsed.pages.filter((p) => inSection(p.url, prefix));
    if (mine.length) {
      used.push(url);
      pages.push(...mine);
    }
  }
  return { used, pages };
}

/**
 * How to read a section: its feed if it has one with pages in the section, else the
 * sitemaps that list the section, else the links on the section's own page.
 */
export async function detect(fetcher: Fetcher, prefix: string) {
  let html = "";
  try {
    html = await getText(fetcher, prefix);
  } catch {
    html = "";
  }
  const origin = new URL(prefix).origin;
  // The section's own feed first (WordPress: <section>/feed/), then the ones it announces.
  const feeds = [...new Set([`${prefix}feed/`, ...feedLinks(html, prefix)])];
  for (const feed of feeds) {
    try {
      const pages = feedPages(await getText(fetcher, feed), feed, prefix);
      if (pages.length)
        return { method: "feed" as const, readFrom: [feed], pages };
    } catch {
      // Not a feed; try the next.
    }
  }
  let sitemaps = [`${origin}/sitemap.xml`];
  try {
    const robots = await getText(fetcher, `${origin}/robots.txt`);
    const listed = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map(
      (m) => m[1],
    );
    if (listed.length) sitemaps = listed;
  } catch {
    // No robots.txt: the usual sitemap address.
  }
  const fromMaps = await fromSitemaps(fetcher, sitemaps, prefix);
  if (fromMaps.pages.length)
    return {
      method: "sitemap" as const,
      readFrom: fromMaps.used,
      pages: fromMaps.pages,
    };
  const links = sectionLinks(html, prefix);
  if (links.length)
    return { method: "links" as const, readFrom: [prefix], pages: links };
  return null;
}

async function read(
  fetcher: Fetcher,
  source: typeof watchSources.$inferSelect,
): Promise<WatchedPage[]> {
  if (source.method === "feed")
    return feedPages(
      await getText(fetcher, source.readFrom[0]),
      source.readFrom[0],
      source.prefix,
    );
  if (source.method === "sitemap")
    return (await fromSitemaps(fetcher, source.readFrom, source.prefix)).pages;
  return sectionLinks(await getText(fetcher, source.prefix), source.prefix);
}

const addSchema = z.object({
  url: z.string().min(3).max(500),
  role: z.enum(WATCH_ROLES).default("signal"),
});
const roleSchema = z.object({ role: z.enum(WATCH_ROLES) });
const host = (prefix: string) => bare(prefix).replace(/\/$/, "");

export function createSiteWatch(deps: {
  database: Database;
  fetch?: Fetcher;
  now?: () => Date;
}) {
  const db = deps.database;
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  /** Reads one section and records its pages; the first scan only sets the baseline. */
  async function scanOne(source: typeof watchSources.$inferSelect) {
    let s = source;
    let pages: WatchedPage[];
    if (!s.method) {
      const found = await detect(fetcher, s.prefix);
      if (!found) throw new Error("no pages found");
      [s] = await db
        .update(watchSources)
        .set({ method: found.method, readFrom: found.readFrom })
        .where(eq(watchSources.id, s.id))
        .returning();
      pages = found.pages;
    } else pages = await read(fetcher, s);
    const at = now();
    const first = !s.baselineAt;
    const unique = [...new Map(pages.map((p) => [bare(p.url), p])).values()];
    const inserted = unique.length
      ? await db
          .insert(watchPages)
          .values(
            unique.map((p) => ({
              sourceId: s.id,
              url: p.url,
              title: p.title,
              publishedAt: p.publishedAt,
              firstSeenAt: at,
              baseline: first,
              // Every page gets its phrase from its address, so other sections can be
              // checked against it; new pages of a signal section get a title below.
              phrase: phraseFromPage(p.url, p.title, s.prefix),
            })),
          )
          .onConflictDoNothing()
          .returning()
      : [];
    let fresh = 0;
    if (!first)
      for (const [i, page] of inserted.entries()) {
        fresh += 1;
        if (s.role !== "signal" || page.title || i >= TITLES_PER_SCAN) continue;
        const title = await titleOf(fetcher, page.url);
        if (!title) continue;
        await db
          .update(watchPages)
          .set({
            title,
            phrase: phraseFromPage(page.url, title, s.prefix) ?? page.phrase,
          })
          .where(eq(watchPages.id, page.id));
      }
    // Pages recorded before phrases were kept for every page (S83) get theirs now.
    const missing = await db
      .select({
        id: watchPages.id,
        url: watchPages.url,
        title: watchPages.title,
      })
      .from(watchPages)
      .where(and(eq(watchPages.sourceId, s.id), isNull(watchPages.phrase)))
      .limit(5_000);
    for (const page of missing) {
      const phrase = phraseFromPage(page.url, page.title, s.prefix);
      if (phrase)
        await db
          .update(watchPages)
          .set({ phrase })
          .where(eq(watchPages.id, page.id));
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(watchPages)
      .where(eq(watchPages.sourceId, s.id));
    await db
      .update(watchSources)
      .set({
        baselineAt: s.baselineAt ?? at,
        lastCheckedAt: at,
        lastError: null,
        pagesKnown: n,
      })
      .where(eq(watchSources.id, s.id));
    return fresh;
  }

  /** Every section once; one failing does not stop the rest. */
  async function scan() {
    const sources = await db
      .select()
      .from(watchSources)
      .orderBy(asc(watchSources.createdAt));
    let fresh = 0;
    let failed = 0;
    for (const source of sources) {
      try {
        fresh += await scanOne(source);
      } catch (error) {
        failed += 1;
        logger.warn("sitewatch.scan_failed", {
          prefix: source.prefix,
          error,
        });
        await db
          .update(watchSources)
          .set({
            lastCheckedAt: now(),
            lastError: (error instanceof Error ? error.message : "failed")
              .replace(/\s+https?:\S+/, "")
              .slice(0, 200),
          })
          .where(eq(watchSources.id, source.id));
      }
    }
    return { sources: sources.length, fresh, failed };
  }

  /**
   * For each phrase, the other sections with a page on the same trend (old or new), by
   * host. A signal page's own section does not count.
   */
  async function alsoOn(items: { phrase: string; sourceId: string }[]) {
    const out = new Map<string, Set<string>>();
    if (!items.length) return out;
    const [sources, pages] = await Promise.all([
      db.select().from(watchSources),
      db
        .selectDistinct({
          sourceId: watchPages.sourceId,
          phrase: watchPages.phrase,
        })
        .from(watchPages)
        .where(sql`${watchPages.phrase} is not null`),
    ]);
    const hostOf = new Map(sources.map((x) => [x.id, host(x.prefix)]));
    const known = pages.map((p) => ({
      sourceId: p.sourceId,
      toks: tokens(p.phrase!),
    }));
    for (const item of items) {
      const key = `${item.sourceId}|${item.phrase}`;
      const found = new Set<string>();
      const mine = tokens(item.phrase);
      for (const p of known)
        if (p.sourceId !== item.sourceId && sameTokens(mine, p.toks))
          found.add(hostOf.get(p.sourceId) ?? "");
      out.set(key, found);
    }
    return out;
  }

  return {
    scan,

    async sourceCount() {
      const [{ n }] = await db.select({ n: count() }).from(watchSources);
      return n;
    },

    /**
     * The new words' name source: scans, then hands over signal sections' new pages'
     * phrases not handed over yet, oldest first. A phrase another watched site also has
     * a page for (a cross-check) is hotter.
     */
    async names(limit: number): Promise<NameItem[]> {
      await scan();
      const rows = (
        await db
          .select({ page: watchPages })
          .from(watchPages)
          .innerJoin(watchSources, eq(watchSources.id, watchPages.sourceId))
          .where(
            and(
              eq(watchSources.role, "signal"),
              eq(watchPages.baseline, false),
              isNull(watchPages.sentAt),
              sql`${watchPages.phrase} is not null`,
            ),
          )
          .orderBy(asc(watchPages.firstSeenAt))
          .limit(limit)
      ).map((r) => r.page);
      if (!rows.length) return [];
      const cross = await alsoOn(
        rows.map((r) => ({ phrase: r.phrase!, sourceId: r.sourceId })),
      );
      await db
        .update(watchPages)
        .set({ sentAt: now() })
        .where(
          inArray(
            watchPages.id,
            rows.map((r) => r.id),
          ),
        );
      const items = new Map<string, NameItem>();
      for (const r of rows)
        if (!items.has(r.phrase!))
          items.set(r.phrase!, {
            name: r.phrase!,
            // Another watched site has a page on it too: hotter.
            heat: cross.get(`${r.sourceId}|${r.phrase}`)?.size ? 3 : 2,
            releasedAt: (r.publishedAt ?? r.firstSeenAt).toISOString(),
          });
      return [...items.values()];
    },

    async add(body: unknown) {
      const parsed = addSchema.safeParse(body);
      const prefix = parsed.success ? normalizePrefix(parsed.data.url) : null;
      const role = parsed.success ? parsed.data.role : "signal";
      if (!prefix) throw new AppError("INVALID_INPUT", "Not a site address");
      const [{ n }] = await db.select({ n: count() }).from(watchSources);
      if (n >= MAX_WATCH_SOURCES)
        throw new AppError("INVALID_INPUT", "Too many watched sites");
      const [row] = await db
        .insert(watchSources)
        .values({ prefix, role, createdAt: now() })
        .onConflictDoNothing()
        .returning();
      if (row) return { source: row, created: true };
      const [existing] = await db
        .select()
        .from(watchSources)
        .where(eq(watchSources.prefix, prefix));
      return { source: existing, created: false };
    },

    /** Turns a section into a signal or a cross-check. */
    async setRole(id: string, body: unknown) {
      const parsed = roleSchema.safeParse(body);
      if (!parsed.success) throw new AppError("INVALID_INPUT", "Invalid role");
      if (!z.uuid().safeParse(id).success)
        throw new AppError("NOT_FOUND", "Watched site not found");
      const [row] = await db
        .update(watchSources)
        .set({ role: parsed.data.role })
        .where(eq(watchSources.id, id))
        .returning();
      if (!row) throw new AppError("NOT_FOUND", "Watched site not found");
      return row;
    },

    async remove(id: string) {
      if (!z.uuid().safeParse(id).success)
        throw new AppError("NOT_FOUND", "Watched site not found");
      const [row] = await db
        .delete(watchSources)
        .where(eq(watchSources.id, id))
        .returning({ id: watchSources.id });
      if (!row) throw new AppError("NOT_FOUND", "Watched site not found");
    },

    /**
     * The watched sections, and the signal sections' newest new pages with the new word
     * each became and the other watched sites that have the same trend.
     */
    async overview(limit = 100) {
      const [sources, pages] = await Promise.all([
        db.select().from(watchSources).orderBy(asc(watchSources.prefix)),
        db
          .select({
            id: watchPages.id,
            sourceId: watchPages.sourceId,
            url: watchPages.url,
            title: watchPages.title,
            phrase: watchPages.phrase,
            publishedAt: watchPages.publishedAt,
            firstSeenAt: watchPages.firstSeenAt,
            newWordId: newWords.id,
          })
          .from(watchPages)
          .innerJoin(watchSources, eq(watchSources.id, watchPages.sourceId))
          .leftJoin(newWords, eq(newWords.phrase, watchPages.phrase))
          .where(
            and(
              eq(watchPages.baseline, false),
              eq(watchSources.role, "signal"),
            ),
          )
          .orderBy(desc(watchPages.firstSeenAt), asc(watchPages.url))
          .limit(limit),
      ]);
      const cross = await alsoOn(
        pages.flatMap((p) =>
          p.phrase ? [{ phrase: p.phrase, sourceId: p.sourceId }] : [],
        ),
      );
      return {
        sources,
        pages: pages.map((p) => ({
          ...p,
          alsoOn: p.phrase
            ? [...(cross.get(`${p.sourceId}|${p.phrase}`) ?? [])].sort()
            : [],
        })),
      };
    },
  };
}

export type SiteWatch = ReturnType<typeof createSiteWatch>;
