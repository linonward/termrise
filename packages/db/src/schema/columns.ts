import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

// Shared column helpers for the schema files.
export const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

export const createdAt = () =>
  timestamp({ withTimezone: true }).defaultNow().notNull();
