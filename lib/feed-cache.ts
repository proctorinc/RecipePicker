import type { FeedPinsPage } from "@/types/view-models";

type FeedCacheEntry = {
  page: FeedPinsPage;
  scrollY: number;
};

const feedCache = new Map<string, FeedCacheEntry>();

export function getFeedCacheKey(query: string, tagId?: string) {
  return `${tagId ?? "home"}:${query.trim()}`;
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
