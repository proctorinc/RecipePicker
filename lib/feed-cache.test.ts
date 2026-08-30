import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeedPinsPage } from "@/types/view-models";

const page: FeedPinsPage = {
  items: [],
  nextCursor: null,
  hasMore: false,
};

describe("feed cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("restores a feed page and its scroll position after the module reloads", async () => {
    const storage = createSessionStorage();
    vi.stubGlobal("window", { sessionStorage: storage });

    const cache = await import("@/lib/feed-cache");
    const key = cache.getFeedCacheKey("pasta");

    cache.cacheFeedPage(key, page);
    cache.cacheFeedScrollPosition(key, 640);

    vi.resetModules();

    const reloadedCache = await import("@/lib/feed-cache");
    expect(reloadedCache.getCachedFeed(key)).toEqual({ page, scrollY: 640 });
  });
});

function createSessionStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
