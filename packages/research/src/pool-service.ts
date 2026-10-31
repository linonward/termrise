// The keyword pool (docs/product/keyword-pool.md): one row per keyword with its latest
// verdict and next check, plus every check appended. Rounds (pool-round.ts) and the
// maintainer's reviews write through record(); nothing else changes a keyword's status.
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  lte,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  apiUsage,
  POOL_STATUSES,
  poolChecks,
  poolKeywords,
  poolRounds,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

import { type Reason, TOOL_SITE_RULES } from "./pool-rules";
import type { TrendCheck } from "./pool-trend";

export type PoolStatus = (typeof POOL_STATUSES)[number];
export type PoolKeyword = typeof poolKeywords.$inferSelect;
export type PoolCheck = typeof poolChecks.$inferSelect;
export type PoolRound = typeof poolRounds.$inferSelect;

const DAY_MS = 86_400_000;
/** Days until a failed keyword is worth another look, by the limit it failed. */
export const RECHECK_FAILED_DAYS = { H6: 90, H1: 180, H5: 120 } as const;
/** Days until another look, by status. queued and new are due at once. */
export const RECHECK_DAYS: Partial<Record<PoolStatus, number>> = {
  new: 0,
  queued: 0,
  watch: 1,
  unsure: 7,
  candidate: 14,
};
const NEVER: PoolStatus[] = ["excluded", "selected", "dropped"];
export const POOL_PAGE_SIZE = 50;
export const POOL_PHRASE_MAX_LENGTH = 80;
export const POOL_NOTE_MAX_LENGTH = 500;
const MAX_ADD = 100;

/** When to look at a keyword again; null for never (a decision, H2, H3, H4 or H7). */
export function nextCheckAt(status: PoolStatus, reasons: Reason[], at: Date) {
  if (NEVER.includes(status)) return null;
  let days: number | undefined;
  if (status === "failed") {
    const failed = new Set(
      reasons.filter((r) => r.result === "fail").map((r) => r.rule),
    );
    days = (["H6", "H1", "H5"] as const)
      .filter((rule) => failed.has(rule))
      .map((rule) => RECHECK_FAILED_DAYS[rule])[0];
    if (days === undefined) return null;
  } else days = RECHECK_DAYS[status] ?? 30;
  return new Date(at.getTime() + days * DAY_MS);
}

export const normalizePhrase = (phrase: string) =>
  phrase.trim().toLowerCase().replace(/\s+/g, " ");

/** The latest data a check carries onto the keyword row. */
export type KeywordFields = Partial<{
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpcMicros: number | null;
  variants: string[];
  variantCount: number | null;
  strongCompetitors: number | null;
  innerPages: number | null;
  trend: TrendCheck | null;
}>;

export type CheckInput = {
  phrase: string;
  source?: string | null;
  status: PoolStatus;
  reasons: Reason[];
  kind: PoolCheck["kind"];
  roundId?: string | null;
  reviewerId?: string | null;
  data?: Record<string, unknown>;
  fields?: KeywordFields;
  /** When the check was made; default now. Imports keep their own dates. */
  at?: Date;
};

const phrase = z
  .string()
  .transform(normalizePhrase)
  .pipe(z.string().min(1).max(POOL_PHRASE_MAX_LENGTH));
const note = z.string().trim().max(POOL_NOTE_MAX_LENGTH);
const addSchema = z.object({
  phrases: z.array(phrase).min(1).max(MAX_ADD),
  source: z.string().trim().min(1).max(100).default("idea"),
});
const answer = z.object({ ok: z.boolean(), note: note.min(1) });
const reviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select") }),
  z.object({ action: z.literal("drop"), note: note.optional() }),
  z.object({ action: z.literal("exclude"), note: note.optional() }),
  z.object({ action: z.literal("restore") }),
  z.object({
    action: z.literal("answer"),
    monetization: answer.optional(),
    compliance: answer.optional(),
    aiAngle: note.optional(),
  }),
]);
const listQuery = z.object({
  status: z.enum(POOL_STATUSES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  sort: z.enum(["volume", "next", "updated"]).catch("updated"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

const notFound = () =>
  new AppError("POOL_KEYWORD_NOT_FOUND", "Pool keyword not found");
const invalid = () => new AppError("INVALID_INPUT", "Invalid pool request");

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalid();
  return parsed.data;
}

export function createKeywordPool(deps: {
  database: Database;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  /** Saves a check and makes it the keyword's latest verdict; adds the keyword if new. */
  async function record(input: CheckInput) {
    const at = input.at ?? now();
    const key = normalizePhrase(input.phrase);
    return database.transaction(async (tx) => {
      // What a check changes on an existing keyword; a new one also gets its phrase,
      // first source and first-seen time.
      const update = {
        status: input.status,
        reasons: input.reasons,
        lastCheckedAt: input.status === "new" ? null : at,
        nextCheckAt: nextCheckAt(input.status, input.reasons, at),
        updatedAt: at,
        ...input.fields,
      };
      const values = {
        ...update,
        phrase: key,
        sources: input.source ? [input.source] : [],
        firstSeenAt: at,
      };
      const [keyword] = await tx
        .insert(poolKeywords)
        .values(values)
        .onConflictDoUpdate({
          target: poolKeywords.phrase,
          set: {
            ...update,
            // A source is added once; the first one stays first.
            sources: input.source
              ? sql`case when ${input.source} = any(${poolKeywords.sources}) then ${poolKeywords.sources} else array_append(${poolKeywords.sources}, ${input.source}) end`
              : poolKeywords.sources,
          },
        })
        .returning();
      await tx.insert(poolChecks).values({
        keywordId: keyword.id,
        roundId: input.roundId ?? null,
        kind: input.kind,
        status: input.status,
        reasons: input.reasons,
        data: input.data ?? {},
        rules: TOOL_SITE_RULES,
        reviewerId: input.reviewerId ?? null,
        createdAt: at,
      });
      return keyword;
    });
  }

  /** New ideas from the maintainer; keywords already in the pool are left alone. */
  async function add(userId: string, body: unknown) {
    const { phrases, source } = parse(addSchema, body);
    const unique = [...new Set(phrases)];
    const existing = new Set(
      (
        await database
          .select({ phrase: poolKeywords.phrase })
          .from(poolKeywords)
          .where(inArray(poolKeywords.phrase, unique))
      ).map((r) => r.phrase),
    );
    const added: PoolKeyword[] = [];
    for (const p of unique.filter((p) => !existing.has(p)))
      added.push(
        await record({
          phrase: p,
          source,
          status: "new",
          reasons: [],
          kind: "review",
          reviewerId: userId,
          data: { action: "add" },
        }),
      );
    return { added, existing: [...existing] };
  }

  async function list(query: Record<string, string | undefined>) {
    const { status, q, sort, page } = listQuery.parse(query);
    const where = and(
      status ? eq(poolKeywords.status, status) : undefined,
      q
        ? ilike(poolKeywords.phrase, `%${q.replace(/[%_\\]/g, "\\$&")}%`)
        : undefined,
    );
    const order =
      sort === "volume"
        ? [
            sql`${poolKeywords.searchVolume} desc nulls last`,
            asc(poolKeywords.phrase),
          ]
        : sort === "next"
          ? [
              sql`${poolKeywords.nextCheckAt} asc nulls last`,
              asc(poolKeywords.phrase),
            ]
          : [desc(poolKeywords.updatedAt), asc(poolKeywords.phrase)];
    const [items, [{ total }], counts] = await Promise.all([
      database
        .select()
        .from(poolKeywords)
        .where(where)
        .orderBy(...order)
        .limit(POOL_PAGE_SIZE)
        .offset((page - 1) * POOL_PAGE_SIZE),
      database.select({ total: count() }).from(poolKeywords).where(where),
      database
        .select({ status: poolKeywords.status, n: count() })
        .from(poolKeywords)
        .groupBy(poolKeywords.status),
    ]);
    return {
      items,
      total,
      page,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<
        Record<PoolStatus, number>
      >,
    };
  }

  async function get(id: string) {
    if (!z.uuid().safeParse(id).success) throw notFound();
    const [keyword] = await database
      .select()
      .from(poolKeywords)
      .where(eq(poolKeywords.id, id));
    if (!keyword) throw notFound();
    const checks = await database
      .select()
      .from(poolChecks)
      .where(eq(poolChecks.keywordId, id))
      .orderBy(desc(poolChecks.createdAt))
      .limit(100);
    return { keyword, checks };
  }

  /** Keywords whose next check has come, queued ones first. */
  async function due(limit: number) {
    return database
      .select()
      .from(poolKeywords)
      .where(
        and(
          isNotNull(poolKeywords.nextCheckAt),
          lte(poolKeywords.nextCheckAt, now()),
        ),
      )
      .orderBy(
        sql`case ${poolKeywords.status} when 'queued' then 0 when 'watch' then 1 when 'new' then 2 else 3 end`,
        asc(poolKeywords.nextCheckAt),
      )
      .limit(limit);
  }

  /** The maintainer's decision or answers; each is kept as a review check. */
  async function review(userId: string, id: string, body: unknown) {
    const input = parse(reviewSchema, body);
    const { keyword } = await get(id);
    const base = {
      phrase: keyword.phrase,
      kind: "review" as const,
      reviewerId: userId,
      data: input,
    };
    const reasons = keyword.reasons as Reason[];
    const refuse = () =>
      new AppError("POOL_REVIEW_INVALID", "Not possible from this status");
    switch (input.action) {
      case "select":
        if (keyword.status !== "candidate") throw refuse();
        return record({ ...base, status: "selected", reasons });
      case "drop":
        if (keyword.status === "dropped") throw refuse();
        return record({ ...base, status: "dropped", reasons });
      case "exclude":
        if (keyword.status === "excluded") throw refuse();
        return record({
          ...base,
          status: "excluded",
          reasons: [
            { rule: "exclude", result: "fail", value: input.note ?? null },
          ],
        });
      case "restore":
        if (!["excluded", "dropped", "failed"].includes(keyword.status))
          throw refuse();
        return record({ ...base, status: "queued", reasons: [] });
      case "answer": {
        const fails: Reason[] = [];
        if (input.monetization && !input.monetization.ok)
          fails.push({
            rule: "H4",
            result: "fail",
            value: input.monetization.note,
          });
        if (input.compliance && !input.compliance.ok)
          fails.push({
            rule: "H7",
            result: "fail",
            value: input.compliance.note,
          });
        const fields = {
          ...(input.monetization && { monetization: input.monetization.note }),
          ...(input.compliance && { compliance: input.compliance.note }),
          ...(input.aiAngle !== undefined && { aiAngle: input.aiAngle }),
        };
        await database
          .update(poolKeywords)
          .set(fields)
          .where(eq(poolKeywords.id, keyword.id));
        return record({
          ...base,
          // A failed H4 or H7 ends the keyword; answers alone keep its status.
          status: fails.length > 0 ? "failed" : keyword.status,
          reasons: fails.length > 0 ? fails : reasons,
        });
      }
    }
  }

  /** Asks the worker for a round now; an unfinished round is returned instead. */
  async function requestRound(userId: string, body: unknown) {
    const { source } = parse(
      z.object({
        source: z
          .string()
          .trim()
          .regex(/^(suffix|ranked):[a-z0-9.\- ]{1,60}$/i)
          .optional(),
      }),
      body ?? {},
    );
    const [open] = await database
      .select()
      .from(poolRounds)
      .where(inArray(poolRounds.status, ["queued", "running"]))
      .limit(1);
    if (open) return { round: open, created: false };
    const [round] = await database
      .insert(poolRounds)
      .values({
        kind: "manual",
        source: source?.toLowerCase() ?? null,
        requestedBy: userId,
        createdAt: now(),
      })
      .returning();
    return { round, created: true };
  }

  /** Recent rounds with what each spent, in micro-USD. */
  async function rounds(limit = 30) {
    const rows = await database
      .select()
      .from(poolRounds)
      .orderBy(desc(poolRounds.createdAt))
      .limit(limit);
    const spent = await spentByRound(rows.map((r) => r.id));
    return rows.map((round) => ({
      round,
      spentMicros: spent.get(round.id) ?? 0,
    }));
  }

  async function getRound(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new AppError("POOL_ROUND_NOT_FOUND", "Pool round not found");
    const [round] = await database
      .select()
      .from(poolRounds)
      .where(eq(poolRounds.id, id));
    if (!round)
      throw new AppError("POOL_ROUND_NOT_FOUND", "Pool round not found");
    const spent = await spentByRound([id]);
    return { round, spentMicros: spent.get(id) ?? 0 };
  }

  // Settled costs, plus reservations still held or failed (their cost is unknown).
  async function spentByRound(ids: string[]) {
    if (ids.length === 0) return new Map<string, number>();
    const rows = await database
      .select({
        roundId: apiUsage.poolRoundId,
        total: sql<number>`coalesce(sum(case when ${apiUsage.status} in ('settled', 'released') then ${apiUsage.costMicros} else ${apiUsage.reservedMicros} end), 0)::bigint`,
      })
      .from(apiUsage)
      .where(inArray(apiUsage.poolRoundId, ids))
      .groupBy(apiUsage.poolRoundId);
    return new Map(rows.map((r) => [r.roundId as string, Number(r.total)]));
  }

  return {
    record,
    add,
    list,
    get,
    due,
    review,
    requestRound,
    rounds,
    getRound,
  };
}

export type KeywordPool = ReturnType<typeof createKeywordPool>;
