type VisibilitySource = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/**
 * Calls `poll` every `intervalMs`, starting the wait only after the previous
 * poll has finished, so slow requests never overlap. Pauses while the tab is
 * hidden and polls at once when it is shown again. `poll` resolves `true` to
 * stop. Returns a cleanup that aborts the request in flight.
 */
export function startPolling(
  intervalMs: number,
  poll: (signal: AbortSignal) => Promise<boolean>,
  doc: VisibilitySource = document,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waitingForVisible = false;

  async function run() {
    timer = undefined;
    if (doc.visibilityState === "hidden") {
      waitingForVisible = true;
      return;
    }
    const stop = await poll(controller.signal).catch(() => false);
    if (!stop && !controller.signal.aborted)
      timer = setTimeout(run, intervalMs);
  }
  function onVisibilityChange() {
    if (!waitingForVisible || doc.visibilityState === "hidden") return;
    waitingForVisible = false;
    void run();
  }

  doc.addEventListener("visibilitychange", onVisibilityChange);
  timer = setTimeout(run, intervalMs);
  return () => {
    controller.abort();
    clearTimeout(timer);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
