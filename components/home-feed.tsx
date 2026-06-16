"use client";

import { useEffect, useRef, useState } from "react";

import { FeedCardSkeleton } from "@/components/loading-skeletons";
import { PinCard } from "@/components/pin-card";
import { Card, CardContent } from "@/components/ui/card";
import {
  appendFeedItems,
  buildFeedColumns,
  buildFeedLoadingSkeletons,
  getFeedColumnCount,
} from "@/lib/feed-layout";
import type { FeedPinCard } from "@/types/view-models";

type HomeFeedProps = {
  initialItems: FeedPinCard[];
  initialCursor: string | null;
  initialHasMore: boolean;
  query: string;
};

export function HomeFeed({
  initialItems,
  initialCursor,
  initialHasMore,
  query,
}: HomeFeedProps) {
  const [columnCount, setColumnCount] = useState(getInitialColumnCount);
  const [items, setItems] = useState(initialItems);
  const [columns, setColumns] = useState(() =>
    buildFeedColumns(initialItems, getInitialColumnCount()),
  );
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
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
    isFetchingRef.current = false;
  }, [initialCursor, initialHasMore, initialItems, query]);

  useEffect(() => {
    setColumns(buildFeedColumns(itemsRef.current, columnCount));
  }, [columnCount]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || isFetchingRef.current || !hasMore) {
          return;
        }

        void loadMore();
      },
      {
        rootMargin: "1200px 0px 1200px 0px",
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, hasMore, query]);

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
      if (cursor) {
        params.set("cursor", cursor);
      }

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

      let appendedItems: FeedPinCard[] = [];
      setItems((current) => {
        appendedItems = page.items.filter(
          (item) =>
            !current.some((existing) => existing.recipeId === item.recipeId),
        );

        if (appendedItems.length === 0) {
          return current;
        }

        const nextItems = [...current, ...appendedItems];
        itemsRef.current = nextItems;
        return nextItems;
      });
      if (appendedItems.length > 0) {
        setColumns((current) => appendFeedItems(current, appendedItems));
      }
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      isFetchingRef.current = false;
      setIsLoadingMore(false);
    }
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
              <PinCard
                key={card.recipeId}
                card={card}
                priority={columnIndex < 2 && index < 2}
              />
            ))}
            {isLoadingMore
              ? loadingSkeletons[columnIndex]?.map((skeleton) => (
                  <FeedCardSkeleton
                    key={skeleton.id}
                    aspectVariant={skeleton.aspectVariant}
                  />
                ))
              : null}
          </div>
        ))}
      </section>

      {hasMore ? <div ref={sentinelRef} className="h-px w-full" /> : null}

      {!hasMore ? (
        <p className="pb-10 text-center text-sm text-muted-foreground">
          You&apos;re all caught up.
        </p>
      ) : null}
    </>
  );
}

function getInitialColumnCount() {
  return 2;
}
