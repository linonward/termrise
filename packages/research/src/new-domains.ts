// Newly registered domains (docs/product/keyword-pool.md#new-domains, S98): a maker who
// buys "secret-santa-no-email.com" has seen a need, often days before a page or a search
// shows it. WhoisDS publishes each day's new domains free, for any use (checked
// 2026-11-22 on whoisds.com/newly-registered-domains). We keep the ones that look like a
// tool, probe a few each scan, and hand their phrases to the new words; a new word whose
// letters show up in a new domain gets this source too (a cross-check).
import { inflateRawSync } from "node:zlib";

import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { newDomains, newWords } from "@repo/db/schema";
import { logger } from "@repo/observability/logger";

import type { NameItem } from "./adapters/name-sources";

const LIST_URL = (day: string) =>
  `https://www.whoisds.com//whois-database/newly-registered-domains/${Buffer.from(`${day}.zip`).toString("base64")}/nrd`;
const UA = "termrise-new-domains/1.0 (+https://termrise.com)";
/** The TLDs tool sites use; the rest of the 70,000 a day are left out. */
const TLDS = new Set(["com", "net", "org", "app", "io", "ai", "co", "tools"]);
/** Words that mark a tool or AI site in a domain (a subset of the new words' roots). */
export const TOOL_WORDS = [
  "generator",
  "maker",
  "creator",
  "converter",
  "calculator",
  "checker",
  "editor",
  "remover",
  "upscaler",
  "enhancer",
  "translator",
  "tracker",
  "planner",
  "template",
  "templates",
  "prompts",
  "filter",
  "effect",
  "effects",
  "video",
  "photo",
  "image",
  "avatar",
  "headshot",
  "meme",
  "tierlist",
  "quiz",
  "simulator",
  "detector",
  "finder",
  "builder",
  "designer",
  "ai",
];
const KEEP_DAYS = 30;
const PROBE_PER_RUN = 60;
const CROSS_DAYS = 14;
const PARKED =
  /(domain|\.(com|net|org|io|ai|app|co)) (is )?for sale|buy this domain|parked|godaddy|sedo|dan\.com|afternic|hugedomains|namecheap parking|this domain may be for sale/i;

/** The one file of a zip archive (deflate or stored), without a zip library. */
export function unzipOne(zip: Buffer): Buffer {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip");
  const dir = zip.readUInt32LE(end + 16);
  const method = zip.readUInt16LE(dir + 10);
  const size = zip.readUInt32LE(dir + 20);
  const local = zip.readUInt32LE(dir + 42);
  const start =
    local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + size);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`zip method ${method}`);
}

/** Names we never build for: gambling, adult, loans. */
const BLOCKED =
  /(casino|betting|bet\d|slot|poker|porn|sex|escort|viagra|loan|payday|casinos)/;
/** Two-letter words a tool phrase keeps; any other is likely a country code ("fr"). */
const SHORT_OK = new Set(
  "ai 3d tv pc vs ui ux io qr id no my to of in on at by up go do me we it is or an as be".split(
    " ",
  ),
);

/** A word of a phrase: letters, or a short number ("gta 5"); not "1f4u0r". */
const plainWord = (w: string) => /^[a-z]+$/.test(w) || /^\d{1,2}$/.test(w);

/**
 * A domain worth keeping: a tool TLD and a tool word in its name ("ai" only as a word
 * between hyphens), or three or more plain words. Two hyphenated words are not enough:
 * most of those are local shops.
 */
export function keepDomain(domain: string) {
  const parts = domain.toLowerCase().split(".");
  if (parts.length !== 2 || !TLDS.has(parts[1])) return null;
  const label = parts[0];
  if (label.length < 6 || /\d{4,}/.test(label) || BLOCKED.test(label))
    return null;
  const words = label.split("-");
  const tool =
    TOOL_WORDS.some((w) => w !== "ai" && label.includes(w)) ||
    words.includes("ai");
  // Or a need said in three or more plain words ("secret-santa-no-email"); the screen
  // drops the local shops among them for free.
  const need = words.length >= 3 && words.every(plainWord);
  return tool || need ? label : null;
}

/**
 * The phrase a domain names: its hyphenated words, or a tool word at the end split off
 * ("weightcalculator" → "weight calculator"). Null when the name gives no words.
 */
export function phraseOfDomain(label: string) {
  const l = label.toLowerCase();
  if (l.includes("-")) {
    const words = l.split("-").filter(Boolean);
    return words.length >= 2 &&
      words.length <= 8 &&
      words.every(plainWord) &&
      words.some((w) => w.length >= 3) &&
      words.every((w) => w.length !== 2 || SHORT_OK.has(w))
      ? words.join(" ")
      : null;
  }
  const word = [...TOOL_WORDS]
    .sort((a, b) => b.length - a.length)
    .find((w) => w !== "ai" && l.endsWith(w) && l.length - w.length >= 4);
  const rest = word ? l.slice(0, -word.length) : "";
  return word && /^[a-z]+$/.test(rest) ? `${rest} ${word}` : null;
}

/** What a domain's home page says, after a short wait. */
export async function probeDomain(fetcher: typeof fetch, domain: string) {
  try {
    const res = await fetcher(`https://${domain}`, {
      headers: { "user-agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok)
      return { status: "unresolved" as const, title: null, hasPricing: null };
    const html = (await res.text()).slice(0, 300_000);
    const title =
      /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim() ?? null;
    if (PARKED.test(`${title ?? ""} ${html.slice(0, 20_000)}`))
      return { status: "parked" as const, title, hasPricing: null };
    // The same signs as pricingOf (S99): a pricing page's path, or a real price.
    const hasPricing =
      /href=["'][^"'?#]*\/(?:pricing|plans|price|upgrade)\/?["']/i.test(html) ||
      pricesIn(html).length > 0;
    return { status: "live" as const, title, hasPricing };
  } catch {
    return { status: "unresolved" as const, title: null, hasPricing: null };
  }
}

/** Prices on a page: "$9.90/mo", "€29", "$2.99" (at most four, once each). */
export function pricesIn(html: string) {
  // A price with cents or a period: "$9.90", "$49/mo". Bare "$2" is too often a number
  // in an article or a script to count.
  const text = html.replace(
    /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,
    " ",
  );
  const found = text.match(
    /[$€£]\s?\d{1,3}(?:[.,]\d{2}(?:\s*\/\s*(?:month|mo|year|yr|week))?|\s*\/\s*(?:month|mo|year|yr|week))/gi,
  );
  return [...new Set((found ?? []).map((p) => p.replace(/\s+/g, "")))].slice(
    0,
    4,
  );
}

/**
 * Whether a site charges (S99): its home page links to pricing or plans, or shows prices;
 * a linked pricing page is read too. Null when the site does not answer.
 */
export async function pricingOf(fetcher: typeof fetch, domain: string) {
  const read = async (url: string) => {
    const res = await fetcher(url, {
      headers: { "user-agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok ? (await res.text()).slice(0, 300_000) : null;
  };
  try {
    const home = await read(`https://${domain}`);
    if (home === null) return null;
    const link = /href=["']([^"']*(?:pricing|plans)[^"']*)["']/i.exec(
      home,
    )?.[1];
    let prices = pricesIn(home);
    if (link && prices.length === 0) {
      const page = await read(
        new URL(link, `https://${domain}`).toString(),
      ).catch(() => null);
      if (page) prices = pricesIn(page);
    }
    return { domain, hasPricing: Boolean(link) || prices.length > 0, prices };
  } catch {
    return null;
  }
}

export function createNewDomains(deps: {
  database: Database;
  fetch?: typeof fetch;
  now?: () => Date;
}) {
  const db = deps.database;
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  /** Yesterday's list (UTC), once: the kept domains go in as pending. */
  async function importYesterday() {
    const day = new Date(now().getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const [seen] = await db
      .select({ domain: newDomains.domain })
      .from(newDomains)
      .where(eq(newDomains.listedOn, day))
      .limit(1);
    if (seen) return 0;
    const res = await fetcher(LIST_URL(day), {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`whoisds ${res.status}`);
    const text = unzipOne(Buffer.from(await res.arrayBuffer())).toString(
      "utf8",
    );
    const rows = text
      .split(/\r?\n/)
      .map((d) => d.trim().toLowerCase())
      .flatMap((domain) => {
        const label = keepDomain(domain);
        return label
          ? [{ domain, label, listedOn: day, phrase: phraseOfDomain(label) }]
          : [];
      });
    for (let i = 0; i < rows.length; i += 500)
      await db
        .insert(newDomains)
        .values(rows.slice(i, i + 500))
        .onConflictDoNothing();
    // A month is enough for the cross-check.
    const old = new Date(now().getTime() - KEEP_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await db.delete(newDomains).where(lt(newDomains.listedOn, old));
    return rows.length;
  }

  /** Probes the next pending domains, those with a phrase first. */
  async function probe() {
    const pending = await db
      .select()
      .from(newDomains)
      .where(eq(newDomains.status, "pending"))
      // Names that read as a phrase first, in no particular order (md5 spreads the
      // letters, so digits do not come first).
      .orderBy(
        sql`${newDomains.phrase} is null`,
        sql`md5(${newDomains.domain})`,
      )
      .limit(PROBE_PER_RUN);
    // Six at a time: a slow or silent server costs up to 8 seconds.
    for (let i = 0; i < pending.length; i += 6)
      await Promise.all(
        pending.slice(i, i + 6).map(async (d) => {
          const found = await probeDomain(fetcher, d.domain);
          await db
            .update(newDomains)
            .set({ ...found, probedAt: now() })
            .where(eq(newDomains.domain, d.domain));
        }),
      );
    return pending.length;
  }

  return {
    importYesterday,
    probe,

    /**
     * The new words' name source: imports and probes, then hands over (1) the phrases of
     * probed domains that are not parked, a pricing page hottest, and (2) recent new words
     * whose letters appear in a new domain, so they gain this source (a cross-check).
     */
    async names(limit: number): Promise<NameItem[]> {
      try {
        await importYesterday();
      } catch (error) {
        logger.warn("newdomains.import_failed", { error });
      }
      await probe();
      const fresh = await db
        .select()
        .from(newDomains)
        .where(
          and(
            isNull(newDomains.sentAt),
            sql`${newDomains.phrase} is not null`,
            sql`${newDomains.status} in ('live', 'unresolved')`,
          ),
        )
        .orderBy(
          sql`${newDomains.hasPricing} desc nulls last`,
          asc(newDomains.domain),
        )
        .limit(limit);
      if (fresh.length)
        await db
          .update(newDomains)
          .set({ sentAt: now() })
          .where(
            sql`${newDomains.domain} in (${sql.join(
              fresh.map((d) => sql`${d.domain}`),
              sql`, `,
            )})`,
          );
      const items: NameItem[] = fresh.map((d) => ({
        name: d.phrase!,
        heat: d.hasPricing ? 3 : d.status === "live" ? 2 : 1,
        releasedAt: `${d.listedOn}T00:00:00.000Z`,
      }));
      // Cross-check: recent words found in a new domain's letters.
      const since = new Date(now().getTime() - CROSS_DAYS * 86_400_000);
      const recent = await db
        .select({ phrase: newWords.phrase, firstSeenAt: newWords.firstSeenAt })
        .from(newWords)
        .where(gte(newWords.firstSeenAt, since));
      const labels = (
        await db
          .select({ label: newDomains.label, listedOn: newDomains.listedOn })
          .from(newDomains)
          .where(gte(newDomains.listedOn, since.toISOString().slice(0, 10)))
      ).map((l) => ({
        compact: l.label.replace(/-/g, ""),
        listedOn: l.listedOn,
      }));
      const taken = new Set(items.map((i) => i.name));
      for (const w of recent) {
        if (items.length >= limit * 2) break;
        const compact = w.phrase.replace(/[^a-z0-9]/g, "");
        if (compact.length < 6 || taken.has(w.phrase)) continue;
        const hit = labels.find((l) => l.compact.includes(compact));
        if (hit)
          items.push({
            name: w.phrase,
            heat: 2,
            releasedAt: `${hit.listedOn}T00:00:00.000Z`,
          });
      }
      return items;
    },
  };
}

export type NewDomains = ReturnType<typeof createNewDomains>;
