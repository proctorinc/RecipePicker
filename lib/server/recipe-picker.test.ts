import { describe, expect, it } from "vitest";

import { recipePickerTestUtils, type TestRecipeCandidate } from "@/lib/server/recipe-picker";

function createCandidate(overrides: Partial<TestRecipeCandidate>): TestRecipeCandidate {
  return {
    recipeId: "recipe-1",
    title: "Chicken Orzo Skillet",
    imageUrl: null,
    siteName: "Kitchen Notes",
    shortDescription: "A creamy chicken skillet dinner with spinach and orzo.",
    averageRating: null,
    reviewCount: 0,
    reviewNotes: [],
    updatedAt: "2026-06-06T00:00:00.000Z",
    ingredients: [],
    categories: [],
    keywords: [],
    cuisine: null,
    timeText: "",
    searchText: "chicken orzo skillet creamy dinner spinach",
    matchText: "chicken orzo skillet creamy dinner spinach",
    reviewText: "",
    pinTitle: "Chicken Orzo Skillet",
    score: 0,
    matchedReasons: [],
    isStrongMatch: false,
    ...overrides,
  };
}

describe("fallbackInterpretRecipePrompt", () => {
  it("maps rejection language to replace_set", () => {
    const interpretation = recipePickerTestUtils.fallbackInterpretRecipePrompt({
      prompt: "No I don't like those, give me something lighter",
      currentSetRecipeIds: ["recipe-1"],
      pinnedRecipeIds: [],
      activeRecipeId: null,
      recipeMap: new Map([["recipe-1", createCandidate({})]]),
    });

    expect(interpretation.intent).toBe("replace_set");
    expect(interpretation.keywordTerms).toContain("light");
  });

  it("maps narrowing language to refine_set", () => {
    const interpretation = recipePickerTestUtils.fallbackInterpretRecipePrompt({
      prompt: "Keep these but make it chicken only",
      currentSetRecipeIds: ["recipe-1"],
      pinnedRecipeIds: [],
      activeRecipeId: null,
      recipeMap: new Map([["recipe-1", createCandidate({})]]),
    });

    expect(interpretation.intent).toBe("refine_set");
    expect(interpretation.mustIncludeIngredients).toContain("chicken");
  });

  it("maps additive language to add_to_set", () => {
    const interpretation = recipePickerTestUtils.fallbackInterpretRecipePrompt({
      prompt: "Add a couple more like the shrimp one",
      currentSetRecipeIds: ["recipe-2"],
      pinnedRecipeIds: ["recipe-2"],
      activeRecipeId: "recipe-2",
      recipeMap: new Map([["recipe-2", createCandidate({ recipeId: "recipe-2", title: "Creamy Shrimp Orzo" })]]),
    });

    expect(interpretation.intent).toBe("add_to_set");
    expect(interpretation.similarToLikedRecipeIds).toContain("recipe-2");
  });

  it("detects rating and review focused requests", () => {
    const interpretation = recipePickerTestUtils.fallbackInterpretRecipePrompt({
      prompt: "Give me the best rated chicken recipes with crispy skin",
      currentSetRecipeIds: [],
      pinnedRecipeIds: [],
      activeRecipeId: null,
      recipeMap: new Map(),
    });

    expect(interpretation.preferHighlyRated).toBe(true);
    expect(interpretation.mustIncludeIngredients).toContain("chicken");
    expect(interpretation.reviewTerms).toContain("crispy");
  });
});

describe("recipe scoring and set building", () => {
  it("removes recipes that match excluded ingredients", () => {
    const recipe = createCandidate({
      ingredients: [
        {
          canonicalIngredientId: "mushroom",
          canonicalName: "Mushroom",
          ingredientText: "mushrooms",
          originalText: "mushrooms",
          normalizedIngredientPhrase: "mushroom",
          attributes: [],
        },
      ],
      matchText: "mushrooms creamy pasta",
      searchText: "mushrooms creamy pasta",
    });

    const excluded = recipePickerTestUtils.isExcludedRecipe(recipe, {
      includeIngredientResolutions: [],
      excludeIngredientResolutions: [{
        normalizedIngredientPhrase: "mushroom",
        canonicalIngredientId: "mushroom",
        canonicalDisplayName: "Mushroom",
        parentCanonicalIngredientId: null,
        parentCanonicalDisplayName: null,
        ingredientKind: "leaf",
        descendantCanonicalIngredientIds: [],
        searchCanonicalIngredientIds: ["mushroom"],
        attributes: [],
        matchConfidence: 100,
        matchedBy: "test",
        normalizationStatus: "confirmed",
      }],
      interpretation: {
        intent: "replace_set",
        mustIncludeIngredients: [],
        mustExcludeIngredients: ["mushroom"],
        mealTypes: [],
        titleTerms: [],
        keywordTerms: [],
        cuisineTerms: [],
        timeHint: null,
        similarToLikedRecipeIds: [],
        similarToCurrentRecipeIds: [],
        reviewTerms: [],
        preferHighlyRated: false,
        preferRecipesYouLike: false,
        explanation: "",
      },
      pinnedRecipeIds: new Set<string>(),
      currentSetRecipeIds: [],
      recipeMap: new Map([[recipe.recipeId, recipe]]),
    });

    expect(excluded).toBe(true);
  });

  it("keeps pinned recipes in the set during refinement", () => {
    const pinned = createCandidate({ recipeId: "pinned", title: "Shrimp Orzo", score: 20, isStrongMatch: true });
    const ranked = [
      createCandidate({ recipeId: "fresh", title: "Fresh Salad", score: 15, isStrongMatch: true }),
      pinned,
      createCandidate({ recipeId: "chicken", title: "Chicken Bowl", score: 12, isStrongMatch: true }),
    ];

    const selected = recipePickerTestUtils.buildRecipePickerSet({
      candidates: ranked,
      currentSetRecipeIds: ["pinned"],
      pinnedRecipeIds: ["pinned"],
      intent: "refine_set",
    });

    expect(selected[0]?.recipeId).toBe("pinned");
    expect(selected.some((recipe) => recipe.recipeId === "pinned")).toBe(true);
  });

  it("boosts title matches during scoring", () => {
    const recipe = createCandidate({
      recipeId: "chow",
      title: "Cantonese Chow Mein",
      pinTitle: "Easy Chow Mein Recipe",
      matchText: "cantonese chow mein easy noodles dinner",
      searchText: "cantonese chow mein easy noodles dinner",
    });

    const scored = recipePickerTestUtils.scoreRecipeCandidate(recipe, {
      includeIngredientResolutions: [],
      excludeIngredientResolutions: [],
      interpretation: {
        intent: "replace_set",
        mustIncludeIngredients: [],
        mustExcludeIngredients: [],
        mealTypes: [],
        titleTerms: ["chow mein"],
        keywordTerms: [],
        cuisineTerms: [],
        timeHint: null,
        similarToLikedRecipeIds: [],
        similarToCurrentRecipeIds: [],
        reviewTerms: [],
        preferHighlyRated: false,
        preferRecipesYouLike: false,
        explanation: "",
      },
      pinnedRecipeIds: new Set<string>(),
      currentSetRecipeIds: [],
      recipeMap: new Map([[recipe.recipeId, recipe]]),
    });

    expect(scored.score).toBeGreaterThan(4);
    expect(scored.matchedReasons).toContain("Title matches chow mein");
  });

  it("prefers highly rated recipes when the user asks for favorites", () => {
    const favorite = createCandidate({
      recipeId: "favorite",
      title: "Favorite Chicken",
      averageRating: 4.9,
      reviewCount: 6,
      reviewNotes: ["We make this on repeat and everyone loves it."],
      reviewText: "we make this on repeat and everyone loves it",
      matchText: "favorite chicken",
      searchText: "favorite chicken",
    });
    const okay = createCandidate({
      recipeId: "okay",
      title: "Okay Chicken",
      averageRating: 3.8,
      reviewCount: 2,
      reviewNotes: ["Pretty good."],
      reviewText: "pretty good",
      matchText: "okay chicken",
      searchText: "okay chicken",
    });

    const favoriteScore = recipePickerTestUtils.scoreRecipeCandidate(favorite, {
      includeIngredientResolutions: [],
      excludeIngredientResolutions: [],
      interpretation: {
        intent: "replace_set",
        mustIncludeIngredients: ["chicken"],
        mustExcludeIngredients: [],
        mealTypes: [],
        titleTerms: [],
        keywordTerms: [],
        cuisineTerms: [],
        timeHint: null,
        similarToLikedRecipeIds: [],
        similarToCurrentRecipeIds: [],
        reviewTerms: [],
        preferHighlyRated: true,
        preferRecipesYouLike: true,
        explanation: "",
      },
      pinnedRecipeIds: new Set<string>(),
      currentSetRecipeIds: [],
      recipeMap: new Map([[favorite.recipeId, favorite], [okay.recipeId, okay]]),
    });
    const okayScore = recipePickerTestUtils.scoreRecipeCandidate(okay, {
      includeIngredientResolutions: [],
      excludeIngredientResolutions: [],
      interpretation: {
        intent: "replace_set",
        mustIncludeIngredients: ["chicken"],
        mustExcludeIngredients: [],
        mealTypes: [],
        titleTerms: [],
        keywordTerms: [],
        cuisineTerms: [],
        timeHint: null,
        similarToLikedRecipeIds: [],
        similarToCurrentRecipeIds: [],
        reviewTerms: [],
        preferHighlyRated: true,
        preferRecipesYouLike: true,
        explanation: "",
      },
      pinnedRecipeIds: new Set<string>(),
      currentSetRecipeIds: [],
      recipeMap: new Map([[favorite.recipeId, favorite], [okay.recipeId, okay]]),
    });

    expect(favoriteScore.score).toBeGreaterThan(okayScore.score);
    expect(favoriteScore.matchedReasons).toContain("Rated 4.9 stars by your kitchen");
  });

  it("matches review note text when requested", () => {
    const recipe = createCandidate({
      recipeId: "crispy",
      title: "Chicken Thighs",
      reviewNotes: ["The skin gets super crispy and the sauce is amazing."],
      reviewText: "the skin gets super crispy and the sauce is amazing",
      searchText: "chicken thighs the skin gets super crispy and the sauce is amazing",
      matchText: "chicken thighs the skin gets super crispy and the sauce is amazing",
    });

    const scored = recipePickerTestUtils.scoreRecipeCandidate(recipe, {
      includeIngredientResolutions: [],
      excludeIngredientResolutions: [],
      interpretation: {
        intent: "replace_set",
        mustIncludeIngredients: ["chicken"],
        mustExcludeIngredients: [],
        mealTypes: [],
        titleTerms: [],
        keywordTerms: [],
        cuisineTerms: [],
        timeHint: null,
        similarToLikedRecipeIds: [],
        similarToCurrentRecipeIds: [],
        reviewTerms: ["crispy"],
        preferHighlyRated: false,
        preferRecipesYouLike: false,
        explanation: "",
      },
      pinnedRecipeIds: new Set<string>(),
      currentSetRecipeIds: [],
      recipeMap: new Map([[recipe.recipeId, recipe]]),
    });

    expect(scored.matchedReasons).toContain("Reviews mention crispy");
  });

  it("parses valid inline recipe references into clickable segments", () => {
    const parsed = recipePickerTestUtils.parseInlineRecipeReferences(
      "I’d start with <recipe:recipe-1|Chicken Orzo Skillet> tonight.",
      new Map([
        ["recipe-1", createCandidate({ recipeId: "recipe-1", title: "Chicken Orzo Skillet" })],
      ]),
    );

    expect(parsed.inlineRecipeRefs).toEqual([{ recipeId: "recipe-1", label: "Chicken Orzo Skillet" }]);
    expect(parsed.segments).toEqual([
      { type: "text", text: "I’d start with " },
      { type: "recipe", recipeId: "recipe-1", label: "Chicken Orzo Skillet" },
      { type: "text", text: " tonight." },
    ]);
  });

  it("falls back to plain text when an inline recipe reference is not allowed", () => {
    const parsed = recipePickerTestUtils.parseInlineRecipeReferences(
      "Maybe <recipe:missing|Mystery Dish> if you want something different.",
      new Map(),
    );

    expect(parsed.inlineRecipeRefs).toEqual([]);
    expect(parsed.segments).toEqual([
      { type: "text", text: "Maybe <recipe:missing|Mystery Dish> if you want something different." },
    ]);
  });
});
