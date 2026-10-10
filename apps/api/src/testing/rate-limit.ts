import { expect } from "vitest";

/**
 * Sends requests until one answers 429 and checks that at least `limit` came first.
 * Rate limits count per fixed one-minute window, so a test that crosses a minute boundary
 * starts a new count: 2 × limit + 1 requests span at most two windows and must hit the
 * limit. Returns the limited response.
 */
export async function expectRateLimited(
  send: () => Promise<Response>,
  limit: number,
) {
  for (let i = 0; i < 2 * limit + 1; i++) {
    const response = await send();
    if (response.status === 429) {
      expect(i, "requests allowed before 429").toBeGreaterThanOrEqual(limit);
      return response;
    }
  }
  throw new Error(`no request was rate limited after ${2 * limit + 1}`);
}
