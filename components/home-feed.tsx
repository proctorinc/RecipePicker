"use client";

import { useEffect, useRef, useState } from "react";

import {
  FeedCardSkeleton,
  FeedCardsSkeleton,
} from "@/components/loading-skeletons";
import { PinCard } from "@/components/pin-card";
import { Card, CardContent } from "@/components/ui/card";
import {
  appendFeedItems,
  buildFeedColumns,
  buildFeedLoadingSkeletons,
  getFeedColumnCount,
  getFeedPrefetchTriggerIndex,
} from "@/lib/feed-layout";
import type { FeedPinCard, FeedPinsPage } from "@/types/view-models";

const DEFAULT_FEED_PAGE_SIZE = 50;

type HomeFeedProps = {
  initialItems: FeedPinCard[];
  initialCursor: string | null;
  initialHasMore: boolean;
  query: string;
  tagId?: string;
  isSearching?: boolean;
  onPageChange: (page: FeedPinsPage) => void;
};

export function HomeFeed({
  initialItems,
  initialCursor,
  initialHasMore,
  query,
  tagId,
  isSearching = false,
  onPageChange,
}: HomeFeedProps) {
  const [columnCount, setColumnCount] = useState(getInitialColumnCount);
  const [items, setItems] = useState(initialItems);
  const [columns, setColumns] = useState(() =>
    buildFeedColumns(initialItems, getInitialColumnCount()),
  );
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastBatchSize, setLastBatchSize] = useState(initialItems.length);
  const prefetchSentinelRef = useRef<HTMLDivElement | null>(null);
  const endSentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const itemsRef = useRef(items);
  const loadingSkeletons = buildFeedLoadingSkeletons(columnCount);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    function updateColumnCount() {
      const nextCount = getFeedColumnCount(window.innerWidth);
      setColumnCount((current) =>
        current === nextCount ? current : nextCount,
      );
    }

    updateColumnCount();
    window.addEventListener("resize", updateColumnCount);

    return () => window.removeEventListener("resize", updateColumnCount);
  }, []);

  useEffect(() => {
    setItems(initialItems);
    itemsRef.current = initialItems;
    setColumns(buildFeedColumns(initialItems, columnCount));
    setCursor(initialCursor);
    setHasMore(initialHasMore);
    setIsLoadingMore(false);
    setLastBatchSize(initialItems.length);
    isFetchingRef.current = false;
  }, [initialCursor, initialHasMore, initialItems, query]);

  useEffect(() => {
    setColumns(buildFeedColumns(itemsRef.current, columnCount));
  }, [columnCount]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }

    const sentinels = [
      prefetchSentinelRef.current,
      endSentinelRef.current,
    ].filter((sentinel): sentinel is HTMLDivElement => Boolean(sentinel));

    if (sentinels.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const hasIntersectingEntry = entries.some((entry) => entry.isIntersecting);
        if (!hasIntersectingEntry || isFetchingRef.current || !hasMore) {
          return;
        }

        void loadMore();
      },
      { rootMargin: "0px" },
    );

    for (const sentinel of sentinels) {
      observer.observe(sentinel);
    }

    return () => observer.disconnect();
  }, [cursor, hasMore, items, lastBatchSize, query, tagId]);

  async function loadMore() {
    if (isFetchingRef.current || !hasMore) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (query.trim()) {
        params.set("q", query.trim());
      }
      if (tagId) {
        params.set("tagId", tagId);
      }
      if (cursor) {
        params.set("cursor", cursor);
      }
      params.set("pageSize", String(DEFAULT_FEED_PAGE_SIZE));

      const response = await fetch(`/api/feed?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Feed request failed with status ${response.status}`);
      }

      const page = (await response.json()) as {
        items: FeedPinCard[];
        nextCursor: string | null;
        hasMore: boolean;
      };

      const appendedItems = page.items.filter(
        (item) =>
          !itemsRef.current.some(
            (existing) => existing.recipeId === item.recipeId,
          ),
      );
      const nextItems = [...itemsRef.current, ...appendedItems];

      itemsRef.current = nextItems;
      setItems(nextItems);
      if (appendedItems.length > 0) {
        setColumns((current) => appendFeedItems(current, appendedItems));
      }
      setLastBatchSize(page.items.length);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      onPageChange({
        items: nextItems,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
    } finally {
      isFetchingRef.current = false;
      setIsLoadingMore(false);
    }
  }

  if (isSearching) {
    return <FeedCardsSkeleton />;
  }

  if (items.length === 0) {
    return (
      <Card className="border-dashed border-white/80 bg-white/70">
        <CardContent className="py-12 text-center text-muted-foreground">
          No recipes matched this search yet. Try a broader ingredient, title,
          or site query.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <section className="grid grid-cols-2 items-start gap-2 pb-10 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex flex-col gap-2 md:gap-5">
            {column.items.map((card, index) => (
              <div key={card.recipeId} ref={getCardPrefetchRef(card.recipeId)}>
                <PinCard
                  card={card}
                  priority={columnIndex < 2 && index < 2}
                />
              </div>
            ))}
            {isLoadingMore
              ? loadingSkeletons[columnIndex]?.map((skeleton) => (
                  <FeedCardSkeleton
                    key={skeleton.id}
                    aspectVariant={skeleton.aspectVariant}
                    animationDelayMs={columnIndex * 120}
                  />
                ))
              : null}
          </div>
        ))}
      </section>

      {hasMore ? <div ref={endSentinelRef} className="h-px w-full" /> : null}

      {!hasMore ? (
        <p className="pb-10 text-center text-sm text-muted-foreground">
          You&apos;re all caught up.
        </p>
      ) : null}
    </>
  );

  function getCardPrefetchRef(recipeId: string) {
    if (!hasMore) {
      return undefined;
    }

    const triggerIndex = getFeedPrefetchTriggerIndex(items.length, lastBatchSize);
    const triggerRecipeId = items[triggerIndex]?.recipeId;

    return triggerRecipeId === recipeId ? prefetchSentinelRef : undefined;
  }
}

function getInitialColumnCount() {
  return 2;
}
