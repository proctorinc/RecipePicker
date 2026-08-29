export const ratingFilterValues = ["all", "rated", "unrated"] as const;
export const calendarFilterValues = ["all", "eaten", "not_eaten"] as const;

export type FeedRatingFilter = (typeof ratingFilterValues)[number];
export type FeedCalendarFilter = (typeof calendarFilterValues)[number];

export type FeedFilters = {
  rating: FeedRatingFilter;
  minRating: number | null;
  maxRating: number | null;
  calendar: FeedCalendarFilter;
  readyOnly: boolean;
};

export const defaultFeedFilters: FeedFilters = {
  rating: "all",
  minRating: null,
  maxRating: null,
  calendar: "all",
  readyOnly: false,
};

export function hasActiveFeedFilters(filters: FeedFilters) {
  return filters.rating !== "all"
    || filters.minRating !== null
    || filters.maxRating !== null
    || filters.calendar !== "all"
    || filters.readyOnly;
}

export function getFeedFilterSummary(filters: FeedFilters) {
  const labels: string[] = [];
  const hasRatingRange = filters.minRating !== null || filters.maxRating !== null;

  if (hasRatingRange) {
    labels.push(formatRatingRange(filters.minRating, filters.maxRating));
  } else if (filters.rating === "rated") {
    labels.push("Rated");
  } else if (filters.rating === "unrated") {
    labels.push("Unrated");
  }

  if (filters.calendar === "eaten") labels.push("Eaten");
  if (filters.calendar === "not_eaten") labels.push("Not eaten");
  if (filters.readyOnly) labels.push("Ready");

  return labels;
}

export function appendFeedFilters(params: URLSearchParams, filters: FeedFilters) {
  if (filters.rating !== "all") params.set("rating", filters.rating);
  if (filters.minRating !== null) params.set("minRating", String(filters.minRating));
  if (filters.maxRating !== null) params.set("maxRating", String(filters.maxRating));
  if (filters.calendar !== "all") params.set("calendar", filters.calendar);
  if (filters.readyOnly) params.set("ready", "true");
}

export function readFeedFilters(params: Record<string, string | string[] | undefined>): FeedFilters {
  const rating = params.rating;
  const calendar = params.calendar;
  const minRating = readRating(params.minRating);
  const maxRating = readRating(params.maxRating);
  const hasInvalidRange = minRating !== null && maxRating !== null && minRating > maxRating;

  return {
    rating: rating === "rated" || rating === "unrated" ? rating : "all",
    minRating: hasInvalidRange ? null : minRating,
    maxRating: hasInvalidRange ? null : maxRating,
    calendar: calendar === "eaten" || calendar === "not_eaten" ? calendar : "all",
    readyOnly: params.ready === "true",
  };
}

function readRating(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^(0|[1-4](?:\.5)?|5)$/.test(value)) {
    return null;
  }

  return Number(value);
}

function formatRatingRange(minRating: number | null, maxRating: number | null) {
  if (minRating !== null && maxRating !== null) {
    return `Rated ${minRating}–${maxRating} stars`;
  }

  if (minRating !== null) return `Rated ${minRating}+ stars`;
  return `Rated up to ${maxRating} stars`;
}
