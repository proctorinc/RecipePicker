import { describe, expect, it } from "vitest";

import {
  PINTEREST_SYNC_LEASE_MS,
  formatPinterestAutoSyncFrequency,
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
