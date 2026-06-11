import { describe, expect, it } from "vitest";

import {
  buildCalendarDays,
  formatRelativeTimeShort,
  getTodayDayString,
  getTodayMonthString,
  isValidDayString,
  isValidMonthString,
  shiftMonth,
} from "@/lib/utils";

describe("formatRelativeTimeShort", () => {
  const now = new Date("2026-06-11T12:00:00.000Z");

  it("formats recent timestamps in minutes", () => {
    expect(
      formatRelativeTimeShort("2026-06-11T11:55:00.000Z", now),
    ).toBe("5m ago");
  });

  it("formats recent timestamps in hours", () => {
    expect(
      formatRelativeTimeShort("2026-06-11T09:00:00.000Z", now),
    ).toBe("3h ago");
  });

  it("formats older timestamps in days", () => {
    expect(
      formatRelativeTimeShort("2026-06-08T12:00:00.000Z", now),
    ).toBe("3d ago");
  });

  it("handles missing timestamps", () => {
    expect(formatRelativeTimeShort(null, now)).toBe("Unknown");
  });
});

describe("calendar helpers", () => {
  it("validates day and month strings", () => {
    expect(isValidDayString("2026-06-11")).toBe(true);
    expect(isValidDayString("2026-13-11")).toBe(false);
    expect(isValidMonthString("2026-06")).toBe(true);
    expect(isValidMonthString("2026-13")).toBe(false);
  });

  it("derives today strings from local dates", () => {
    const now = new Date("2026-06-11T12:00:00.000Z");

    expect(getTodayDayString(now)).toBe("2026-06-11");
    expect(getTodayMonthString(now)).toBe("2026-06");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("builds a calendar grid through the last week containing month days", () => {
    const days = buildCalendarDays("2026-06");

    expect(days).toHaveLength(35);
    expect(days[0]).toMatchObject({
      date: "2026-05-31",
      dayNumber: 31,
      inCurrentMonth: false,
    });
    expect(days[11]).toMatchObject({
      date: "2026-06-11",
      dayNumber: 11,
      inCurrentMonth: true,
    });
    expect(days.at(-1)).toMatchObject({
      date: "2026-07-04",
      dayNumber: 4,
      inCurrentMonth: false,
    });
  });
});
