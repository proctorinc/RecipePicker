import { describe, expect, it } from "vitest";

import {
  PINTEREST_SYNC_LEASE_MS,
  formatPinterestAutoSyncFrequency,
  getNextPinterestAutoSyncEligibleAt,
  getPinterestAutoSyncCooldownMs,
  isPinterestSyncLeaseActive,
} from "@/lib/server/sync";

describe("getPinterestAutoSyncCooldownMs", () => {
  it("uses a daily cooldown for free tier", () => {
    expect(getPinterestAutoSyncCooldownMs("free")).toBe(24 * 60 * 60 * 1000);
  });

  it("uses a 10 minute cooldown for premium tier", () => {
    expect(getPinterestAutoSyncCooldownMs("premium")).toBe(10 * 60 * 1000);
  });
});

describe("formatPinterestAutoSyncFrequency", () => {
  it("formats the free tier label", () => {
    expect(formatPinterestAutoSyncFrequency("free")).toBe("every 24h");
  });

  it("formats the premium tier label", () => {
    expect(formatPinterestAutoSyncFrequency("premium")).toBe("every 10m");
  });
});

describe("getNextPinterestAutoSyncEligibleAt", () => {
  it("returns the next eligible time when auto-sync is enabled", () => {
    expect(
      getNextPinterestAutoSyncEligibleAt({
        autoSyncEnabled: true,
        lastSyncAttemptAt: "2026-06-11T12:00:00.000Z",
        subscriptionTier: "premium",
      }),
    ).toBe("2026-06-11T12:10:00.000Z");
  });

  it("returns null when auto-sync is disabled", () => {
    expect(
      getNextPinterestAutoSyncEligibleAt({
        autoSyncEnabled: false,
        lastSyncAttemptAt: "2026-06-11T12:00:00.000Z",
        subscriptionTier: "free",
      }),
    ).toBeNull();
  });
});

describe("isPinterestSyncLeaseActive", () => {
  it("treats recent leases as active", () => {
    const now = Date.UTC(2026, 5, 11, 12, 0, 0);
    const startedAt = new Date(now - 2 * 60 * 1000).toISOString();

    expect(isPinterestSyncLeaseActive(startedAt, now)).toBe(true);
  });

  it("treats stale leases as inactive", () => {
    const now = Date.UTC(2026, 5, 11, 12, 0, 0);
    const startedAt = new Date(now - PINTEREST_SYNC_LEASE_MS - 1000).toISOString();

    expect(isPinterestSyncLeaseActive(startedAt, now)).toBe(false);
  });
});
