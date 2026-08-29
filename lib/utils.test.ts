import { describe, expect, it } from "vitest";

import {
  buildCalendarDays,
  expandDayRange,
  formatDay,
  formatIso8601Duration,
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

describe("formatIso8601Duration", () => {
  it("formats hours and minutes from ISO 8601 durations", () => {
    expect(formatIso8601Duration("PT1H30M")).toBe("1 hr 30 min");
    expect(formatIso8601Duration("PT45M")).toBe("45 min");
    expect(formatIso8601Duration("PT2H")).toBe("2 hr");
  });

  it("rolls days into hours and rounds partial minutes up", () => {
    expect(formatIso8601Duration("P1DT15M")).toBe("24 hr 15 min");
    expect(formatIso8601Duration("PT59S")).toBe("1 min");
  });

  it("returns null for empty values and preserves unrecognized strings", () => {
    expect(formatIso8601Duration(null)).toBeNull();
    expect(formatIso8601Duration("about an hour")).toBe("about an hour");
  });
});

describe("calendar helpers", () => {
  it("formats date-only calendar values without shifting the day by timezone", () => {
    expect(formatDay("2026-06-11")).toBe("Jun 11, 2026");
  });

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

  it("derives today strings in a supplied timezone", () => {
    const now = new Date("2026-06-11T01:30:00.000Z");

    expect(getTodayDayString(now, "America/Los_Angeles")).toBe("2026-06-10");
    expect(getTodayDayString(now, "Asia/Tokyo")).toBe("2026-06-11");
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

  it("expands an inclusive date range in either selection direction", () => {
    expect(expandDayRange("2026-06-30", "2026-07-02")).toEqual(["2026-06-30", "2026-07-01", "2026-07-02"]);
    expect(expandDayRange("2026-07-02", "2026-06-30")).toEqual(["2026-06-30", "2026-07-01", "2026-07-02"]);
  });
});
