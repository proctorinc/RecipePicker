export type PinterestSyncProgressRun = {
  status: string;
  trigger: string;
  startedAt: string;
  expectedPinCount: number | null;
  processedPinCount: number;
};

export type PinterestSyncProgressDisplay =
  | { state: "indeterminate"; timeRemainingMs: number | null }
  | { state: "count_only"; processedPinCount: number }
  | { state: "normal"; processedPinCount: number; expectedPinCount: number; percentComplete: number; timeRemainingMs: number | null }
  | { state: "overtime"; processedPinCount: number };

export function getPinterestSyncProgressDisplay(
  run: PinterestSyncProgressRun,
  now = Date.now(),
): PinterestSyncProgressDisplay {
  const expectedPinCount = run.expectedPinCount;
  const elapsedMs = Math.max(0, now - new Date(run.startedAt).getTime());
  if (run.trigger === "auto_new_pins") {
    const timeRemainingMs = run.processedPinCount === 0 || expectedPinCount == null || expectedPinCount <= 0
      ? null
      : Math.max(0, Math.ceil((elapsedMs / run.processedPinCount) * (expectedPinCount - run.processedPinCount)));
    return { state: "indeterminate", timeRemainingMs };
  }

  if (expectedPinCount == null || expectedPinCount <= 0) {
    return { state: "count_only", processedPinCount: run.processedPinCount };
  }

  if (run.processedPinCount > expectedPinCount) {
    return { state: "overtime", processedPinCount: run.processedPinCount };
  }

  const remainingPinCount = expectedPinCount - run.processedPinCount;
  const timeRemainingMs = run.processedPinCount === 0
    ? null
    : Math.max(0, Math.ceil((elapsedMs / run.processedPinCount) * remainingPinCount));

  return {
    state: "normal",
    processedPinCount: run.processedPinCount,
    expectedPinCount,
    percentComplete: Math.min(100, Math.floor((run.processedPinCount / expectedPinCount) * 100)),
    timeRemainingMs,
  };
}

export function formatPinterestSyncTimeRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
