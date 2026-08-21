"use client";

import { useEffect, useRef, useState } from "react";

import { FeedSearch } from "@/components/feed-search";
import { HomeFeed } from "@/components/home-feed";
import type { FeedPinsPage } from "@/types/view-models";

const SEARCH_DEBOUNCE_MS = 350;

type HomeFeedShellProps = {
  initialPage: FeedPinsPage;
  initialQuery: string;
  tagId?: string;
};

export function HomeFeedShell({
  initialPage,
  initialQuery,
  tagId,
}: HomeFeedShellProps) {
  const normalizedInitialQuery = initialQuery.trim();
  const [inputValue, setInputValue] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(normalizedInitialQuery);
  const [page, setPage] = useState(initialPage);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setInputValue(initialQuery);
    setActiveQuery(normalizedInitialQuery);
    setPage(initialPage);
    setIsSearching(false);
  }, [initialPage, initialQuery, normalizedInitialQuery]);

  useEffect(() => {
    const trimmedValue = inputValue.trim();

    if (trimmedValue !== activeQuery && searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
      setIsSearching(false);
    }

    const timeout = window.setTimeout(() => {
      if (trimmedValue === activeQuery) {
        setIsSearching(false);
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
      <HomeFeed
        initialItems={page.items}
        initialCursor={page.nextCursor}
        initialHasMore={page.hasMore}
        query={activeQuery}
        tagId={tagId}
      />
      <div className="fixed left-0 right-0 bottom-24 z-30 px-3 md:bottom-4 md:px-0">
        <div className="mx-auto max-w-md">
          <FeedSearch
            value={inputValue}
            onChange={setInputValue}
            isSearching={isSearching}
          />
        </div>
      </div>
    </>
  );
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
