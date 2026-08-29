import type { FeedPinsPage } from "@/types/view-models";
import { appendFeedFilters, type FeedFilters } from "@/lib/feed-filters";

type FeedCacheEntry = {
  page: FeedPinsPage;
  scrollY: number;
};

const feedCache = new Map<string, FeedCacheEntry>();

export function getFeedCacheKey(query: string, tagId?: string, filters?: FeedFilters) {
  const params = new URLSearchParams();
  appendFeedFilters(params, filters ?? {
    rating: "all", minRating: null, maxRating: null, calendar: "all", readyOnly: false,
  });
  return `${tagId ?? "home"}:${query.trim()}:${params.toString()}`;
}

export function getCachedFeed(key: string) {
  return feedCache.get(key);
}

export function cacheFeedPage(key: string, page: FeedPinsPage) {
  const cached = feedCache.get(key);
  feedCache.set(key, { page, scrollY: cached?.scrollY ?? 0 });
}

export function cacheFeedScrollPosition(key: string, scrollY: number) {
  const cached = feedCache.get(key);
  if (!cached) return;

  feedCache.set(key, { ...cached, scrollY });
}
