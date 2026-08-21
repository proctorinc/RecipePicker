import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatRelativeTimeShort(
  value: string | null | undefined,
  now = new Date(),
) {
  if (!value) {
    return "Unknown";
  }

  const target = new Date(value);
  const diffMs = now.getTime() - target.getTime();

  if (Number.isNaN(target.getTime())) {
    return "Unknown";
  }

  if (diffMs < 60 * 1000) {
    return "just now";
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return `${days}d ago`;
}

export function formatDay(value: string | null | undefined) {
  if (!value) {
    return "Date not included";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatRatingValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No rating";
  }

  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatIso8601Duration(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) {
    return value;
  }

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const totalMinutes = days * 24 * 60 + hours * 60 + minutes + (seconds > 0 ? 1 : 0);

  if (totalMinutes === 0) {
    return "0 min";
  }

  const wholeHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const parts: string[] = [];

  if (wholeHours > 0) {
    parts.push(`${wholeHours} hr`);
  }

  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes} min`);
  }

  return parts.join(" ");
}

export function isValidDayString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

export function isValidMonthString(value: string) {
  return /^\d{4}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}-01T00:00:00.000Z`).getTime());
}

export function expandDayRange(startDate: string, endDate: string) {
  if (!isValidDayString(startDate) || !isValidDayString(endDate)) return [];
  const [start, end] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const limit = new Date(`${end}T00:00:00.000Z`).getTime();
  while (cursor.getTime() <= limit && days.length < 366) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function getTodayDayString(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayMonthString(now = new Date()) {
  return getTodayDayString(now).slice(0, 7);
}

export function shiftMonth(value: string, delta: number) {
  const date = new Date(`${value}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

export function buildCalendarDays(value: string) {
  const monthStart = new Date(`${value}-01T00:00:00.000Z`);
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  );
  const gridStart = new Date(monthStart);
  const gridEnd = new Date(monthEnd);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

  const dayCount =
    Math.round(
      (gridEnd.getTime() - gridStart.getTime()) / (24 * 60 * 60 * 1000),
    ) + 1;

  return Array.from({ length: dayCount }, (_unused, index) => {
    const current = new Date(gridStart);
    current.setUTCDate(gridStart.getUTCDate() + index);
    const date = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;
    return {
      date,
      dayNumber: current.getUTCDate(),
      inCurrentMonth: date.startsWith(`${value}-`),
    };
  });
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function parseJsonRecord(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
