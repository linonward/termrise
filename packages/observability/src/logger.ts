import { AsyncLocalStorage } from "node:async_hooks";

import { stripQueryParams } from "./scrub-query-params";

// Structured JSON logs (docs/architecture/observability.md#observability). Server only:
// node:async_hooks keeps it out of client bundles.
type Fields = Record<string, unknown>;
type Level = "info" | "warn" | "error";

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export type ErrorReporter = (
  error: Error,
  context: { tags: Record<string, string>; extra: Fields },
) => void;

let reportError: ErrorReporter = () => {};

/** Sends every error log to an error tracker; the web app passes Sentry.captureException. */
export function setErrorReporter(reporter: ErrorReporter) {
  reportError = reporter;
}

// Never written: secrets, full prompts, emails.
const REDACTED_KEYS = new Set([
  "email",
  "prompt",
  "apikey",
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
]);

/** Wraps a route handler so its logs carry a requestId (Vercel's x-vercel-id, else a new UUID). */
export function withRequestContext<A extends [Request, ...unknown[]], R>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args) => {
    const requestId = args[0].headers.get("x-vercel-id") ?? crypto.randomUUID();
    return requestContext.run({ requestId }, () => handler(...args));
  };
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return error;
  const code = (error as { code?: unknown }).code;
  return {
    name: error.name,
    message: stripQueryParams(error.message),
    ...(code === undefined ? {} : { code }),
    stack: error.stack && stripQueryParams(error.stack),
  };
}

function redact(fields: Fields): Fields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : value,
    ]),
  );
}

function write(level: Level, eventType: string, fields: Fields = {}) {
  const context = requestContext.getStore();
  const { error, ...rest } = redact(fields);
  const entry: Fields = {
    level,
    time: new Date().toISOString(),
    eventType,
    ...context,
    ...rest,
    ...(error === undefined ? {} : { error: serializeError(error) }),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  // Every error log is a Sentry event (docs/architecture/observability.md#observability).
  if (level === "error")
    reportError(error instanceof Error ? error : new Error(eventType), {
      tags: { eventType, ...context },
      extra: rest,
    });
}

export const logger = {
  info: (eventType: string, fields?: Fields) =>
    write("info", eventType, fields),
  warn: (eventType: string, fields?: Fields) =>
    write("warn", eventType, fields),
  error: (eventType: string, fields?: Fields) =>
    write("error", eventType, fields),
};
