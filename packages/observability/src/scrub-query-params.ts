// Drizzle's DrizzleQueryError message ends with "\nparams: <values>", and the
// values can hold emails and prompts (docs/architecture/observability.md#observability).
// Remove them up to the first stack frame, keeping the SQL text with $n placeholders.
export function stripQueryParams(text: string) {
  return text.replace(/\nparams: [\s\S]*?(?=\n {4}at |$)/, "");
}

/** Structural Sentry event, so this package does not depend on a Sentry SDK. */
type ExceptionEvent = { exception?: { values?: { value?: string }[] } };

export function scrubSentryEvent<E extends ExceptionEvent>(event: E) {
  for (const exception of event.exception?.values ?? [])
    if (exception.value) exception.value = stripQueryParams(exception.value);
  return event;
}
