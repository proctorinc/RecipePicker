import type { FeedPinsPage } from "@/types/view-models";
import { appendFeedFilters, type FeedFilters } from "@/lib/feed-filters";

type FeedCacheEntry = {
  page: FeedPinsPage;
  scrollY: number;
};

const feedCache = new Map<string, FeedCacheEntry>();
const FEED_CACHE_STORAGE_PREFIX = "food-picker:feed-cache:v1:";

export function getFeedCacheKey(query: string, tagId?: string, filters?: FeedFilters) {
  const params = new URLSearchParams();
  appendFeedFilters(params, filters ?? {
    rating: "all", minRating: null, maxRating: null, calendar: "all", readyOnly: false,
  });
  return `${tagId ?? "home"}:${query.trim()}:${params.toString()}`;
}

export function getCachedFeed(key: string) {
  const cached = feedCache.get(key);
  if (cached) {
    return cached;
  }

  const persisted = readPersistedFeed(key);
  if (!persisted) {
    return undefined;
  }

  feedCache.set(key, persisted);
  return persisted;
}

export function cacheFeedPage(key: string, page: FeedPinsPage) {
  const cached = feedCache.get(key);
  const nextEntry = { page, scrollY: cached?.scrollY ?? 0 };
  feedCache.set(key, nextEntry);
  persistFeed(key, nextEntry);
}

export function cacheFeedScrollPosition(key: string, scrollY: number) {
  const cached = feedCache.get(key);
  if (!cached) return;

  const nextEntry = { ...cached, scrollY };
  feedCache.set(key, nextEntry);
  persistFeed(key, nextEntry);
}

function readPersistedFeed(key: string): FeedCacheEntry | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const value = window.sessionStorage.getItem(`${FEED_CACHE_STORAGE_PREFIX}${key}`);
    if (!value) {
      return undefined;
    }

    const entry = JSON.parse(value) as Partial<FeedCacheEntry>;
    if (!isFeedCacheEntry(entry)) {
      window.sessionStorage.removeItem(`${FEED_CACHE_STORAGE_PREFIX}${key}`);
      return undefined;
    }

    return entry;
  } catch {
    return undefined;
  }
}

function persistFeed(key: string, entry: FeedCacheEntry) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${FEED_CACHE_STORAGE_PREFIX}${key}`,
      JSON.stringify(entry),
    );
  } catch {
    // Storage can be unavailable (or full) in private browser contexts. The
    // in-memory cache still provides the same restoration for this session.
  }
}

function isFeedCacheEntry(entry: Partial<FeedCacheEntry>): entry is FeedCacheEntry {
  return (
    typeof entry.scrollY === "number" &&
    typeof entry.page === "object" &&
    entry.page !== null &&
    Array.isArray(entry.page.items) &&
    typeof entry.page.hasMore === "boolean" &&
    (typeof entry.page.nextCursor === "string" || entry.page.nextCursor === null)
  );
}
