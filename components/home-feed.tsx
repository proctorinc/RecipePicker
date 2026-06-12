"use client";

import { useEffect, useRef, useState } from "react";

import { PinCard } from "@/components/pin-card";
import { Card, CardContent } from "@/components/ui/card";
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
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
    setHasMore(initialHasMore);
    setIsLoadingMore(false);
    isFetchingRef.current = false;
  }, [initialCursor, initialHasMore, initialItems, query]);

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

      setItems((current) => [
        ...current,
        ...page.items.filter(
          (item) => !current.some((existing) => existing.recipeId === item.recipeId),
        ),
      ]);
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
      <section className="columns-2 gap-2 pb-10 sm:columns-2 md:columns-3 md:gap-5 lg:columns-4">
        {items.map((card, index) => (
          <PinCard
            key={card.recipeId}
            card={card}
            priority={index < 4}
          />
        ))}
      </section>

      {hasMore ? <div ref={sentinelRef} className="h-px w-full" /> : null}

      {isLoadingMore ? (
        <p className="pb-10 text-center text-sm text-muted-foreground">
          Loading more recipes...
        </p>
      ) : null}

      {!hasMore ? (
        <p className="pb-10 text-center text-sm text-muted-foreground">
          You&apos;re all caught up.
        </p>
      ) : null}
    </>
  );
}
