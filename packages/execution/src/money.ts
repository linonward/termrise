import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import { domains, EXPENSE_CATEGORIES, expenses, sites } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

// Money and renewals for the workbench (docs/architecture/data-model.md#expenses):
// payments the maintainer records, and when each domain the sites use expires.

const DAY_MS = 86_400_000;
/** A domain's registration is read again after this long. */
export const DOMAIN_CHECK_EVERY_MS = 20 * 60 * 60 * 1000;
/** Today lists domains that expire within this many days. */
export const DOMAIN_EXPIRY_WARN_DAYS = 30;
const RDAP = "https://rdap.org/domain/";

/**
 * The registrable domain of a host: its last two labels. The sites only use
 * single-label public suffixes (.com, .org, .app); a host under co.uk would need more.
 */
export function registrableDomain(host: string) {
  return host.toLowerCase().replace(/\.$/, "").split(".").slice(-2).join(".");
}

/** Expiration and registrar from an RDAP domain answer (RFC 9083 events and entities). */
export function parseRdap(body: unknown): {
  expiresAt: Date | null;
  registrar: string | null;
} {
  const b = (body ?? {}) as {
    events?: { eventAction?: string; eventDate?: string }[];
    entities?: { roles?: string[]; vcardArray?: [string, unknown[][]] }[];
  };
  const event = (b.events ?? []).find((e) => e.eventAction === "expiration");
  const at = event?.eventDate ? new Date(event.eventDate) : null;
  const registrarEntity = (b.entities ?? []).find((e) =>
    e.roles?.includes("registrar"),
  );
  const fn = registrarEntity?.vcardArray?.[1]?.find((f) => f[0] === "fn");
  return {
    expiresAt: at && !Number.isNaN(at.getTime()) ? at : null,
    registrar: typeof fn?.[3] === "string" ? fn[3] : null,
  };
}

export function createDomains(deps: {
  database: Database;
  fetch?: typeof fetch;
}) {
  const db = deps.database;
  const get = deps.fetch ?? fetch;

  /** Registrable domains of the live sites. */
  async function wanted() {
    const rows = await db
      .select({ domain: sites.domain })
      .from(sites)
      .where(isNull(sites.removedAt));
    return [...new Set(rows.map((r) => registrableDomain(r.domain)))].sort();
  }

  return {
    /** Looks up domains not read within DOMAIN_CHECK_EVERY_MS; one failure does not stop the rest. */
    async refresh(now = new Date()) {
      const all = await wanted();
      const fresh = new Set(
        (
          await db
            .select({ domain: domains.domain })
            .from(domains)
            .where(
              gte(
                domains.checkedAt,
                new Date(now.getTime() - DOMAIN_CHECK_EVERY_MS),
              ),
            )
        ).map((r) => r.domain),
      );
      let checked = 0;
      let failed = 0;
      for (const domain of all.filter((d) => !fresh.has(d))) {
        let values: {
          expiresAt: Date | null;
          registrar: string | null;
          error: string | null;
        };
        try {
          const response = await get(`${RDAP}${domain}`, {
            headers: {
              accept: "application/rdap+json",
              "user-agent": "termrise-workbench/1.0",
            },
            signal: AbortSignal.timeout(20_000),
          });
          if (!response.ok)
            values = {
              expiresAt: null,
              registrar: null,
              error: `http ${response.status}`,
            };
          else {
            const parsed = parseRdap(await response.json());
            values = {
              ...parsed,
              error: parsed.expiresAt ? null : "no expiration",
            };
          }
        } catch (error) {
          values = {
            expiresAt: null,
            registrar: null,
            error: error instanceof Error ? error.name : "fetch failed",
          };
        }
        // A failed lookup keeps the last known date.
        const set = values.error
          ? { error: values.error, checkedAt: now }
          : { ...values, checkedAt: now };
        await db
          .insert(domains)
          .values({ domain, ...values, checkedAt: now })
          .onConflictDoUpdate({ target: domains.domain, set });
        checked += 1;
        if (values.error) failed += 1;
      }
      return { checked, failed };
    },

    /** Domains of live sites with their expiry, soonest first; unknown ones last. */
    async list(now = new Date()) {
      const all = new Set(await wanted());
      const rows = await db
        .select()
        .from(domains)
        .orderBy(sql`${domains.expiresAt} asc nulls last`, asc(domains.domain));
      return rows
        .filter((r) => all.has(r.domain))
        .map((r) => ({
          ...r,
          daysLeft: r.expiresAt
            ? Math.floor((r.expiresAt.getTime() - now.getTime()) / DAY_MS)
            : null,
        }));
    },
  };
}

const ymd = z.iso.date();
const addSchema = z.object({
  paidOn: ymd,
  amountMinor: z.number().int().min(1).max(100_000_000),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  category: z.enum(EXPENSE_CATEGORIES),
  note: z.string().trim().max(200).default(""),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
    .max(253)
    .optional(),
});
const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .optional();

const invalid = () => new AppError("INVALID_INPUT", "Invalid expense");

/** First day of the month and of the next one, as YYYY-MM-DD. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

export function createExpenses(deps: { database: Database }) {
  const db = deps.database;

  async function totals(month: string) {
    const { from, to } = monthRange(month);
    const rows = await db
      .select({
        currency: expenses.currency,
        amountMinor: sql<number>`sum(${expenses.amountMinor})::int`,
      })
      .from(expenses)
      .where(and(gte(expenses.paidOn, from), lt(expenses.paidOn, to)))
      .groupBy(expenses.currency)
      .orderBy(asc(expenses.currency));
    return rows;
  }

  return {
    async add(userId: string, body: unknown) {
      const parsed = addSchema.safeParse(body);
      if (!parsed.success) throw invalid();
      const [row] = await db
        .insert(expenses)
        .values({
          ...parsed.data,
          domain: parsed.data.domain ?? null,
          createdBy: userId,
        })
        .returning();
      return row;
    },

    async remove(id: string) {
      if (!z.uuid().safeParse(id).success)
        throw new AppError("EXPENSE_NOT_FOUND", "Expense not found");
      const [row] = await db
        .delete(expenses)
        .where(eq(expenses.id, id))
        .returning({ id: expenses.id });
      if (!row) throw new AppError("EXPENSE_NOT_FOUND", "Expense not found");
    },

    /** One month's payments (default this month, UTC), newest first, with totals by currency. */
    async month(query: string | undefined, now = new Date()) {
      const parsed = monthSchema.safeParse(query);
      const month =
        (parsed.success && parsed.data) || now.toISOString().slice(0, 7);
      const { from, to } = monthRange(month);
      const items = await db
        .select()
        .from(expenses)
        .where(and(gte(expenses.paidOn, from), lt(expenses.paidOn, to)))
        .orderBy(desc(expenses.paidOn), desc(expenses.createdAt));
      return { month, items, totals: await totals(month) };
    },

    totals,
  };
}

/** The one-row-per-domain read model, for callers that only need the soon ones. */
export const expiringWithin = <T extends { daysLeft: number | null }>(
  rows: T[],
  days = DOMAIN_EXPIRY_WARN_DAYS,
) => rows.filter((r) => r.daysLeft !== null && r.daysLeft <= days);
