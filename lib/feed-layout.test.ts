import { describe, expect, it } from "vitest";

import {
  appendFeedItems,
  buildFeedColumns,
  buildFeedLoadingSkeletons,
  getFeedColumnCount,
  getFeedPrefetchTriggerIndex,
} from "@/lib/feed-layout";
import type { FeedPinCard } from "@/types/view-models";

describe("feed layout helpers", () => {
  it("distributes initial items into stable columns", () => {
    const columns = buildFeedColumns(
      [
        makeCard("recipe_a", "pin_a"),
        makeCard("recipe_b", "pin_b"),
        makeCard("recipe_c", "pin_c"),
        makeCard("recipe_d", "pin_d"),
      ],
      2,
    );

    expect(columns.map((column) => column.items.map((item) => item.recipeId)))
      .toEqual([
        ["recipe_a", "recipe_d"],
        ["recipe_b", "recipe_c"],
      ]);
  });

  it("appends new items without moving earlier assignments", () => {
    const initial = buildFeedColumns(
      [
        makeCard("recipe_a", "pin_a"),
        makeCard("recipe_b", "pin_b"),
        makeCard("recipe_c", "pin_c"),
      ],
      2,
    );

    const appended = appendFeedItems(initial, [
      makeCard("recipe_d", "pin_d"),
      makeCard("recipe_e", "pin_e"),
    ]);

    expect(initial.map((column) => column.items.map((item) => item.recipeId)))
      .toEqual([
        ["recipe_a"],
        ["recipe_b", "recipe_c"],
      ]);
    expect(appended.map((column) => column.items.map((item) => item.recipeId)))
      .toEqual([
        ["recipe_a", "recipe_d"],
        ["recipe_b", "recipe_c", "recipe_e"],
      ]);
  });

  it("ignores duplicate recipe ids while appending", () => {
    const initial = buildFeedColumns(
      [makeCard("recipe_a", "pin_a"), makeCard("recipe_b", "pin_b")],
      2,
    );

    const appended = appendFeedItems(initial, [
      makeCard("recipe_b", "pin_b"),
      makeCard("recipe_c", "pin_c"),
    ]);

    expect(appended.map((column) => column.items.map((item) => item.recipeId)))
      .toEqual([
        ["recipe_a"],
        ["recipe_b", "recipe_c"],
      ]);
  });

  it("rebuilds layout from the full list when the column count changes", () => {
    const items = [
      makeCard("recipe_a", "pin_a"),
      makeCard("recipe_b", "pin_b"),
      makeCard("recipe_c", "pin_c"),
      makeCard("recipe_d", "pin_d"),
      makeCard("recipe_e", "pin_e"),
    ];

    const twoColumns = buildFeedColumns(items, 2);
    const threeColumns = buildFeedColumns(items, 3);

    expect(twoColumns.map((column) => column.items.length)).toEqual([2, 3]);
    expect(threeColumns.map((column) => column.items.length)).toEqual([1, 2, 2]);
  });

  it("builds three loading skeletons per visible column", () => {
    const skeletons = buildFeedLoadingSkeletons(3);

    expect(skeletons).toHaveLength(3);
    expect(skeletons.map((column) => column)).toEqual([
      [
        { id: "feed-skeleton-0-0", aspectVariant: "taller" },
        { id: "feed-skeleton-0-1", aspectVariant: "tall" },
        { id: "feed-skeleton-0-2", aspectVariant: "square" },
      ],
      [
        { id: "feed-skeleton-1-0", aspectVariant: "tall" },
        { id: "feed-skeleton-1-1", aspectVariant: "square" },
        { id: "feed-skeleton-1-2", aspectVariant: "taller" },
      ],
      [
        { id: "feed-skeleton-2-0", aspectVariant: "square" },
        { id: "feed-skeleton-2-1", aspectVariant: "taller" },
        { id: "feed-skeleton-2-2", aspectVariant: "tall" },
      ],
    ]);
  });

  it("starts prefetching when one third of the latest batch remains", () => {
    expect(getFeedPrefetchTriggerIndex(50, 50)).toBe(33);
    expect(getFeedPrefetchTriggerIndex(75, 25)).toBe(66);
    expect(getFeedPrefetchTriggerIndex(2, 50)).toBe(0);
    expect(getFeedPrefetchTriggerIndex(0, 50)).toBe(-1);
  });

  it("maps widths to the current responsive column counts", () => {
    expect(getFeedColumnCount(390)).toBe(2);
    expect(getFeedColumnCount(900)).toBe(3);
    expect(getFeedColumnCount(1280)).toBe(4);
  });
});

function makeCard(recipeId: string, pinId: string): FeedPinCard {
  return {
    recipeId,
    pinId,
    title: recipeId,
    imageUrl: null,
    previewImageUrl: null,
    dominantColor: null,
    destinationHref: `/recipe/${recipeId}`,
    siteName: null,
    status: "recipe_ready",
    hasRecipe: true,
    searchText: recipeId,
    searchMatches: [],
    averageRating: null,
    reviewCount: 0,
  };
}
