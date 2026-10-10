import type { Bindings } from "../env";

// What the Workers runtime passes to fetch(): bindings from wrangler.jsonc and the execution context.
export function testBindings(connectionString: string): Bindings {
  return { HYPERDRIVE: { connectionString } };
}

export function testExecutionContext() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    passThroughOnException: () => {},
    props: {},
    /** Waits for the work passed to waitUntil(), such as closing the database connection. */
    settled: () => Promise.all(pending),
  };
}
