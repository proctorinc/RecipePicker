import type { FeedPinCard } from "@/types/view-models";

export type FeedCardAspectVariant = "tall" | "taller" | "square";

export type FeedColumnLayout = {
  items: FeedPinCard[];
  estimatedHeight: number;
};

export type FeedSkeletonItem = {
  id: string;
  aspectVariant: FeedCardAspectVariant;
};

const FEED_CARD_HEIGHT_BY_VARIANT: Record<FeedCardAspectVariant, number> = {
  tall: 1.25,
  taller: 1.5,
  square: 1.1875,
};

const FEED_CARD_CHROME_HEIGHT = 0.18;
const SKELETON_VARIANTS: FeedCardAspectVariant[] = ["taller", "tall", "square"];
const FEED_LOADING_SKELETONS_PER_COLUMN = 3;

export function getFeedCardAspectVariant(pinId: string): FeedCardAspectVariant {
  const value = pinId.charCodeAt(pinId.length - 1) % 3;

  if (value === 0) {
    return "tall";
  }
  if (value === 1) {
    return "taller";
  }

  return "square";
}

export function getFeedCardAspectClass(pinId: string) {
  return getFeedCardAspectClassFromVariant(getFeedCardAspectVariant(pinId));
}

export function getFeedCardAspectClassFromVariant(
  variant: FeedCardAspectVariant,
) {
  if (variant === "tall") {
    return "aspect-[4/5]";
  }
  if (variant === "taller") {
    return "aspect-[4/6]";
  }

  return "aspect-[4/4.75]";
}

export function getFeedColumnCount(width: number) {
  if (width >= 1024) {
    return 4;
  }
  if (width >= 768) {
    return 3;
  }

  return 2;
}

export function createEmptyFeedColumns(columnCount: number): FeedColumnLayout[] {
  return Array.from({ length: Math.max(1, columnCount) }, () => ({
    items: [],
    estimatedHeight: 0,
  }));
}

export function buildFeedColumns(
  items: FeedPinCard[],
  columnCount: number,
): FeedColumnLayout[] {
  return appendFeedItems(createEmptyFeedColumns(columnCount), items);
}

export function appendFeedItems(
  columns: FeedColumnLayout[],
  items: FeedPinCard[],
): FeedColumnLayout[] {
  const nextColumns = columns.map((column) => ({
    items: [...column.items],
    estimatedHeight: column.estimatedHeight,
  }));
  const existingIds = new Set(
    nextColumns.flatMap((column) => column.items.map((item) => item.recipeId)),
  );

  for (const item of items) {
    if (existingIds.has(item.recipeId)) {
      continue;
    }

    const column = getShortestColumn(nextColumns);
    column.items.push(item);
    column.estimatedHeight += estimateFeedCardHeight(item);
    existingIds.add(item.recipeId);
  }

  return nextColumns;
}

export function buildFeedLoadingSkeletons(columnCount: number) {
  return Array.from({ length: Math.max(1, columnCount) }, (_unused, index) =>
    Array.from(
      { length: FEED_LOADING_SKELETONS_PER_COLUMN },
      (_unusedItem, skeletonIndex) => ({
        id: `feed-skeleton-${index}-${skeletonIndex}`,
        aspectVariant:
          SKELETON_VARIANTS[
            (index + skeletonIndex) % SKELETON_VARIANTS.length
          ],
      }) satisfies FeedSkeletonItem,
    ),
  );
}

export function getFeedPrefetchTriggerIndex(
  itemCount: number,
  lastBatchSize: number,
) {
  if (itemCount <= 0 || lastBatchSize <= 0) {
    return -1;
  }

  const normalizedBatchSize = Math.min(lastBatchSize, itemCount);
  const remainingItemsInBatch = Math.max(
    1,
    Math.floor(normalizedBatchSize / 3),
  );

  return Math.max(0, itemCount - remainingItemsInBatch - 1);
}

function getShortestColumn(columns: FeedColumnLayout[]) {
  return columns.reduce((shortest, column) =>
    column.estimatedHeight < shortest.estimatedHeight ? column : shortest,
  );
}

function estimateFeedCardHeight(item: FeedPinCard) {
  return (
    FEED_CARD_HEIGHT_BY_VARIANT[getFeedCardAspectVariant(item.pinId)] +
    FEED_CARD_CHROME_HEIGHT
  );
}
