"use client";

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { FeedSearch } from "@/components/feed-search";
import { FeedFilters } from "@/components/feed-filters";
import { HomeFeed } from "@/components/home-feed";
import { FeedPullToRefresh } from "@/components/feed-pull-to-refresh";
import {
  cacheFeedPage,
  cacheFeedScrollPosition,
  getCachedFeed,
  getFeedCacheKey,
} from "@/lib/feed-cache";
import {
  appendFeedFilters,
  defaultFeedFilters,
  getFeedFilterSummary,
  type FeedFilters as FeedFiltersValue,
} from "@/lib/feed-filters";
import type { FeedPinsPage } from "@/types/view-models";

const SEARCH_DEBOUNCE_MS = 350;
const LAST_HOME_FEED_QUERY_KEY = "food-picker:last-home-feed-query";

type HomeFeedShellProps = {
  initialPage: FeedPinsPage;
  initialQuery: string;
  initialFilters?: FeedFiltersValue;
  tagId?: string;
  header?: ReactNode;
};

export function HomeFeedShell({
  initialPage,
  initialQuery,
  initialFilters = defaultFeedFilters,
  tagId,
  header,
}: HomeFeedShellProps) {
  const normalizedInitialQuery = initialQuery.trim();
  const [inputValue, setInputValue] = useState(normalizedInitialQuery);
  const [activeQuery, setActiveQuery] = useState(normalizedInitialQuery);
  const [activeFilters, setActiveFilters] = useState(initialFilters);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const restoredPageRef = useRef<FeedPinsPage | null>(null);
  const cacheKey = getFeedCacheKey(activeQuery, tagId, activeFilters);
  const cachedFeed = getCachedFeed(cacheKey);
  const filterSummary = getFeedFilterSummary(activeFilters);

  useLayoutEffect(() => {
    const nextCachedFeed = getCachedFeed(
      getFeedCacheKey(normalizedInitialQuery, tagId, initialFilters),
    );

    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setInputValue(normalizedInitialQuery);
    setActiveQuery(normalizedInitialQuery);
    setActiveFilters(initialFilters);
    restoredPageRef.current = nextCachedFeed?.page ?? null;
    setPage(nextCachedFeed?.page ?? initialPage);
    setIsSearching(false);
  }, [initialFilters, initialPage, normalizedInitialQuery, tagId]);

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

    // A cached unfiltered feed belongs to the current URL. Prefer it over a
    // previous search so browser back restores the exact feed the user left.
    if (getCachedFeed(getFeedCacheKey("", undefined, initialFilters))) {
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
    syncUrl(savedQuery, initialFilters);

    const cachedSavedFeed = getCachedFeed(
      getFeedCacheKey(savedQuery, undefined, initialFilters),
    );
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
    void fetchSearchPage(savedQuery, initialFilters, controller.signal)
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
  }, [initialFilters, normalizedInitialQuery, tagId]);

  useEffect(() => {
    if (restoredPageRef.current) {
      if (page !== restoredPageRef.current) {
        return;
      }

      restoredPageRef.current = null;
    }

    cacheFeedPage(getFeedCacheKey(activeQuery, tagId, activeFilters), page);
  }, [activeFilters, activeQuery, page, tagId]);

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
        syncUrl(trimmedValue, activeFilters);
        return;
      }

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setIsSearching(true);
      syncUrl(trimmedValue, activeFilters);

      void fetchSearchPage(
        trimmedValue,
        activeFilters,
        controller.signal,
        tagId,
      )
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
  }, [activeFilters, activeQuery, inputValue, tagId]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  return (
    <>
      <FeedPullToRefresh disabled={isSearching} onRefresh={refreshFeed} />
      <div
        className={
          filterSummary.length > 0
            ? "pt-[calc(env(safe-area-inset-top)+6.875rem+var(--pinterest-sync-indicator-height))] md:pt-0"
            : "pt-[calc(env(safe-area-inset-top)+5.25rem+var(--pinterest-sync-indicator-height))] md:pt-0"
        }
      >
        {header ? <div className="mb-6">{header}</div> : null}
        <HomeFeed
          initialItems={page.items}
          initialCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          query={activeQuery}
          filters={activeFilters}
          tagId={tagId}
          isSearching={isSearching}
          onPageChange={setPage}
        />
      </div>
      <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.75rem+var(--pinterest-sync-indicator-height))] z-30 px-3 md:top-auto md:bottom-4 md:px-0">
        <div className="mx-auto max-w-md">
          <div
            className={
              isFilterPanelOpen
                ? "rounded-[1.75rem] m-0 p-0 border border-border/80 bg-background/75 shadow-[0_12px_28px_rgba(73,49,31,0.18)] backdrop-blur-md transition-[border-radius,box-shadow] duration-300 ease-out motion-reduce:transition-none"
                : "block"
            }
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0">
              <div className="min-w-0 flex-1">
                <FeedSearch
                  value={inputValue}
                  onChange={handleSearchChange}
                  isSearching={isSearching}
                />
              </div>
              <FeedFilters
                filters={activeFilters}
                onApply={handleFiltersApply}
                open={isFilterPanelOpen}
                onOpenChange={setIsFilterPanelOpen}
              />
            </div>
          </div>
          {filterSummary.length > 0 ? (
            <p className="px-4 pt-2 text-center text-xs font-medium text-muted-foreground">
              {filterSummary.join(" · ")}
            </p>
          ) : null}
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

  async function refreshFeed() {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    try {
      const nextPage = await fetchSearchPage(
        activeQuery,
        activeFilters,
        controller.signal,
        tagId,
      );

      if (!controller.signal.aborted) {
        setPage(nextPage);
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
      }
    }
  }

  function handleFiltersApply(nextFilters: FeedFiltersValue) {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const nextQuery = inputValue.trim();
    const nextCacheKey = getFeedCacheKey(nextQuery, tagId, nextFilters);
    setActiveFilters(nextFilters);
    setActiveQuery(nextQuery);
    syncUrl(nextQuery, nextFilters);

    const cached = getCachedFeed(nextCacheKey);
    if (cached) {
      setPage(cached.page);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    void fetchSearchPage(nextQuery, nextFilters, controller.signal, tagId)
      .then((nextPage) => {
        if (!controller.signal.aborted) {
          setPage(nextPage);
          setIsSearching(false);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setIsSearching(false);
          console.error("Unable to refresh feed filters.", error);
        }
      });
  }
}

function getSavedHomeFeedQuery(tagId?: string) {
  if (tagId || typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(LAST_HOME_FEED_QUERY_KEY)?.trim() ?? "";
}

function syncUrl(query: string, filters: FeedFiltersValue) {
  const url = new URL(window.location.href);

  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }
  for (const key of ["rating", "minRating", "maxRating", "calendar", "ready"]) {
    url.searchParams.delete(key);
  }
  appendFeedFilters(url.searchParams, filters);

  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextHref !== currentHref) {
    window.history.replaceState(window.history.state, "", nextHref);
  }
}

async function fetchSearchPage(
  query: string,
  filters: FeedFiltersValue,
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
  appendFeedFilters(params, filters);

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
