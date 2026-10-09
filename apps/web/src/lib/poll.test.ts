import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { startPolling } from "./poll";

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  show() {
    this.visibilityState = "visible";
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

let doc: FakeDocument;
beforeEach(() => {
  vi.useFakeTimers();
  doc = new FakeDocument();
});
afterEach(() => vi.useRealTimers());

function deferred() {
  let resolve!: (stop: boolean) => void;
  return { promise: new Promise<boolean>((r) => (resolve = r)), resolve };
}

it("waits for the previous poll before scheduling the next one", async () => {
  const pending = deferred();
  const poll = vi.fn(() => pending.promise);
  startPolling(5_000, poll, doc);
  await vi.advanceTimersByTimeAsync(5_000);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(poll).toHaveBeenCalledTimes(1);
  pending.resolve(false);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(poll).toHaveBeenCalledTimes(2);
});

it("stops when the poll reports a change", async () => {
  const poll = vi.fn(async () => true);
  startPolling(5_000, poll, doc);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(poll).toHaveBeenCalledTimes(1);
});

it("keeps polling after a failed request", async () => {
  const poll = vi
    .fn<() => Promise<boolean>>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(false);
  startPolling(5_000, poll, doc);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(poll).toHaveBeenCalledTimes(2);
});

it("does not poll in a hidden tab and polls at once when it is shown", async () => {
  const poll = vi.fn(async () => false);
  doc.visibilityState = "hidden";
  startPolling(5_000, poll, doc);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(poll).not.toHaveBeenCalled();
  doc.show();
  await vi.advanceTimersByTimeAsync(0);
  expect(poll).toHaveBeenCalledTimes(1);
});

it("aborts the request in flight and stops on cleanup", async () => {
  let signal: AbortSignal | undefined;
  const poll = vi.fn((s: AbortSignal) => {
    signal = s;
    return new Promise<boolean>(() => {});
  });
  const stop = startPolling(5_000, poll, doc);
  await vi.advanceTimersByTimeAsync(5_000);
  stop();
  expect(signal?.aborted).toBe(true);
  doc.show();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(poll).toHaveBeenCalledTimes(1);
});
