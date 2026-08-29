"use client";

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { FeedSearch } from "@/components/feed-search";
import { HomeFeed } from "@/components/home-feed";
import {
  cacheFeedPage,
  cacheFeedScrollPosition,
  getCachedFeed,
  getFeedCacheKey,
} from "@/lib/feed-cache";
import type { FeedPinsPage } from "@/types/view-models";

const SEARCH_DEBOUNCE_MS = 350;
const LAST_HOME_FEED_QUERY_KEY = "food-picker:last-home-feed-query";

type HomeFeedShellProps = {
  initialPage: FeedPinsPage;
  initialQuery: string;
  tagId?: string;
  header?: ReactNode;
};

export function HomeFeedShell({
  initialPage,
  initialQuery,
  tagId,
  header,
}: HomeFeedShellProps) {
  const normalizedInitialQuery = initialQuery.trim();
  const initialCachedFeed = getCachedFeed(
    getFeedCacheKey(normalizedInitialQuery, tagId),
  );
  const [inputValue, setInputValue] = useState(normalizedInitialQuery);
  const [activeQuery, setActiveQuery] = useState(normalizedInitialQuery);
  const [page, setPage] = useState(() => initialCachedFeed?.page ?? initialPage);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const cacheKey = getFeedCacheKey(activeQuery, tagId);
  const cachedFeed = getCachedFeed(cacheKey);

  useEffect(() => {
    const nextCachedFeed = getCachedFeed(
      getFeedCacheKey(normalizedInitialQuery, tagId),
    );

    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setInputValue(normalizedInitialQuery);
    setActiveQuery(normalizedInitialQuery);
    setPage(nextCachedFeed?.page ?? initialPage);
    setIsSearching(false);
  }, [initialPage, normalizedInitialQuery, tagId]);

  useEffect(() => {
    if (tagId) {
      return;
    }

    if (!activeQuery) {
      window.localStorage.removeItem(LAST_HOME_FEED_QUERY_KEY);
      return;
    }

    window.localStorage.setItem(LAST_HOME_FEED_QUERY_KEY, activeQuery);
  }, [activeQuery, tagId]);

  useEffect(() => {
    if (tagId || normalizedInitialQuery) {
      return;
    }

    const savedQuery = getSavedHomeFeedQuery();
    if (!savedQuery) {
      return;
    }

    setInputValue(savedQuery);
    setActiveQuery(savedQuery);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    syncUrl(savedQuery);

    const cachedSavedFeed = getCachedFeed(getFeedCacheKey(savedQuery));
    if (cachedSavedFeed) {
      setPage(cachedSavedFeed.page);
      setIsSearching(false);
      return () => {
        controller.abort();
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
      };
    }

    setIsSearching(true);
    void fetchSearchPage(savedQuery, controller.signal)
      .then((nextPage) => {
        if (controller.signal.aborted) {
          return;
        }

        setPage(nextPage);
        setIsSearching(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setIsSearching(false);
        console.error("Unable to restore feed search.", error);
      });

    return () => {
      controller.abort();
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
      }
    };
  }, [normalizedInitialQuery, tagId]);

  useEffect(() => {
    cacheFeedPage(getFeedCacheKey(activeQuery, tagId), page);
  }, [activeQuery, page, tagId]);

  useLayoutEffect(() => {
    if (!cachedFeed || cachedFeed.scrollY === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: cachedFeed.scrollY, behavior: "instant" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [cacheKey, cachedFeed]);

  useEffect(() => {
    let frame: number | null = null;

    function saveScrollPosition() {
      if (frame !== null) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        cacheFeedScrollPosition(cacheKey, window.scrollY);
        frame = null;
      });
    }

    window.addEventListener("scroll", saveScrollPosition, { passive: true });

    return () => {
      window.removeEventListener("scroll", saveScrollPosition);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      cacheFeedScrollPosition(cacheKey, window.scrollY);
    };
  }, [cacheKey]);

  useEffect(() => {
    const trimmedValue = inputValue.trim();

    if (trimmedValue !== activeQuery && searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }

    const timeout = window.setTimeout(() => {
      if (trimmedValue === activeQuery) {
        syncUrl(trimmedValue);
        return;
      }

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setIsSearching(true);
      syncUrl(trimmedValue);

      void fetchSearchPage(trimmedValue, controller.signal, tagId)
        .then((nextPage) => {
          if (controller.signal.aborted) {
            return;
          }

          setPage(nextPage);
          setActiveQuery(trimmedValue);
          setIsSearching(false);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          setIsSearching(false);
          console.error("Unable to refresh feed search.", error);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeQuery, inputValue, tagId]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  return (
    <>
      <div className="pt-[calc(env(safe-area-inset-top)+5.25rem+var(--pinterest-sync-indicator-height))] md:pt-0">
        {header ? <div className="mb-6">{header}</div> : null}
        <HomeFeed
          initialItems={page.items}
          initialCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          query={activeQuery}
          tagId={tagId}
          isSearching={isSearching}
          onPageChange={setPage}
        />
      </div>
      <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.75rem+var(--pinterest-sync-indicator-height))] z-30 px-3 md:top-auto md:bottom-4 md:px-0">
        <div className="mx-auto max-w-md">
          <FeedSearch
            value={inputValue}
            onChange={handleSearchChange}
            isSearching={isSearching}
          />
        </div>
      </div>
    </>
  );

  function handleSearchChange(nextValue: string) {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setInputValue(nextValue);
    setIsSearching(nextValue.trim() !== activeQuery);
  }
}

function getSavedHomeFeedQuery(tagId?: string) {
  if (tagId || typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(LAST_HOME_FEED_QUERY_KEY)?.trim() ?? "";
}

function syncUrl(query: string) {
  const url = new URL(window.location.href);

  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }

  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextHref !== currentHref) {
    window.history.replaceState(window.history.state, "", nextHref);
  }
}

async function fetchSearchPage(
  query: string,
  signal: AbortSignal,
  tagId?: string,
): Promise<FeedPinsPage> {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }
  if (tagId) {
    params.set("tagId", tagId);
  }

  const response = await fetch(`/api/feed?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Feed request failed with status ${response.status}`);
  }

  return (await response.json()) as FeedPinsPage;
}
