import { describe, expect, it } from "vitest";

import {
  formatPinterestSyncTimeRemaining,
  getPinterestSyncProgressDisplay,
} from "@/lib/pinterest-sync-progress";

const startedAt = "2026-08-27T12:00:00.000Z";
const now = new Date("2026-08-27T12:01:00.000Z").getTime();

describe("getPinterestSyncProgressDisplay", () => {
  it("shows only the processed count without a previous total", () => {
    expect(getPinterestSyncProgressDisplay({ status: "running", trigger: "manual", startedAt, expectedPinCount: null, processedPinCount: 12 }, now))
      .toEqual({ state: "count_only", processedPinCount: 12 });
  });

  it("calculates normal progress and time remaining", () => {
    expect(getPinterestSyncProgressDisplay({ status: "running", trigger: "manual", startedAt, expectedPinCount: 100, processedPinCount: 25 }, now))
      .toEqual({ state: "normal", processedPinCount: 25, expectedPinCount: 100, percentComplete: 25, timeRemainingMs: 180_000 });
  });

  it("does not calculate time remaining before the first pin", () => {
    expect(getPinterestSyncProgressDisplay({ status: "running", trigger: "manual", startedAt, expectedPinCount: 100, processedPinCount: 0 }, now))
      .toMatchObject({ state: "normal", percentComplete: 0, timeRemainingMs: null });
  });

  it("switches to overtime after the previous total is passed", () => {
    expect(getPinterestSyncProgressDisplay({ status: "running", trigger: "manual", startedAt, expectedPinCount: 100, processedPinCount: 101 }, now))
      .toEqual({ state: "overtime", processedPinCount: 101 });
  });

  it("keeps new-pin sync progress indeterminate while calculating its time estimate", () => {
    expect(getPinterestSyncProgressDisplay({ status: "running", trigger: "auto_new_pins", startedAt, expectedPinCount: 250, processedPinCount: 25 }, now))
      .toEqual({ state: "indeterminate", timeRemainingMs: 540_000 });
  });
});

describe("formatPinterestSyncTimeRemaining", () => {
  it("formats a compact time remaining label", () => {
    expect(formatPinterestSyncTimeRemaining(61_000)).toBe("2 min");
  });
});
