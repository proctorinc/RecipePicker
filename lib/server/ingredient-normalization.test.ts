import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openDatabase } from "@/lib/server/database";
import { households } from "@/lib/server/db";
import {
  createCanonicalIngredient,
  mergeIngredientsForShopping,
  normalizeIngredientForHousehold,
  normalizeIngredientKey,
  resolveIngredientSearchQuery,
  upsertReviewedIngredientMapping,
} from "@/lib/server/ingredient-normalization";
import { extractRecipeFromHtml } from "@/lib/server/recipe-parser";

const { mockGenerateIngredientSuggestionsWithHouseholdAi } = vi.hoisted(() => ({
  mockGenerateIngredientSuggestionsWithHouseholdAi: vi.fn(),
}));

vi.mock("@/lib/server/ai-provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/ai-provider")>("@/lib/server/ai-provider");

  return {
    ...actual,
    generateIngredientSuggestionsWithHouseholdAi: mockGenerateIngredientSuggestionsWithHouseholdAi,
  };
});

async function withTestDatabase(
  run: (args: { db: ReturnType<typeof openDatabase>["db"]; householdId: string }) => Promise<void> | void,
) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "food-picker-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
  const { db, sqlite } = openDatabase(sqlitePath);
  const householdId = "household-test";

  try {
    db.insert(households)
      .values({
        householdId,
        name: "Test kitchen",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    await run({ db, householdId });
  } finally {
    sqlite.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  mockGenerateIngredientSuggestionsWithHouseholdAi.mockReset();
});

describe("ingredient extraction and normalization", () => {
  it("parses JSON-LD ingredient lines into structured ingredient fields", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Recipe",
              "name": "Scallion noodles",
              "recipeIngredient": ["1 1/2 cups scallions, sliced"],
              "recipeInstructions": ["Stir everything together."]
            }
          </script>
        </head>
      </html>
    `;

    const result = extractRecipeFromHtml(html, "https://example.com/recipe");
    const ingredient = result.recipe?.ingredients[0];

    expect(result.status).toBe("recipe_extracted");
    expect(ingredient).toMatchObject({
      amountText: "1 1/2",
      amountValue: 1.5,
      amountMaxValue: null,
      unit: "cup",
      ingredientText: "scallions",
      notes: "sliced",
    });
  });

  it("maps close synonyms like scallions to green onion", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const normalized = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "2 scallions",
        ingredientText: "scallions",
      });

      expect(normalized.canonicalDisplayName).toBe("Green onion");
      expect(normalized.normalizationStatus).toBe("auto_matched");
    });
  });

  it("collapses light brown sugar into the brown sugar base ingredient with attributes", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const normalized = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "1 cup light brown sugar",
        ingredientText: "light brown sugar",
      });

      expect(normalized.canonicalDisplayName).toBe("Brown sugar");
      expect(normalized.attributes).toEqual(["light"]);
    });
  });

  it("keeps material flour variants distinct", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const breadFlour = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "2 cups bread flour",
        ingredientText: "bread flour",
      });
      const allPurposeFlour = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "2 cups all-purpose flour",
        ingredientText: "all-purpose flour",
      });

      expect(breadFlour.canonicalIngredientId).not.toBe(allPurposeFlour.canonicalIngredientId);
    });
  });

  it("sends branded or composite ingredients to review", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const normalized = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "1 packet Lipton onion soup mix",
        ingredientText: "Lipton onion soup mix",
      });

      expect(normalized.normalizationStatus).toBe("needs_review");
      expect(normalized.canonicalIngredientId).toBeNull();
    });
  });

  it("reuses prior confirmed mappings for repeated imports", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const canonical = createCanonicalIngredient(db, householdId, "Chili crisp");

      upsertReviewedIngredientMapping({
        db,
        householdId,
        normalizedPhrase: normalizeIngredientKey("momofuku chili crunch"),
        canonicalIngredientId: canonical.canonicalIngredientId,
        aliasText: "momofuku chili crunch",
        attributes: [],
      });

      const normalized = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "1 tbsp Momofuku chili crunch",
        ingredientText: "Momofuku chili crunch",
      });

      expect(normalized.canonicalIngredientId).toBe(canonical.canonicalIngredientId);
      expect(normalized.normalizationStatus).toBe("confirmed");
    });
  });

  it("resolves brown sugar search against light and dark brown sugar variants", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const light = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "1 cup light brown sugar",
        ingredientText: "light brown sugar",
      });
      const dark = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "1 cup dark brown sugar",
        ingredientText: "dark brown sugar",
      });
      const query = resolveIngredientSearchQuery(db, householdId, "brown sugar");

      expect(query?.canonicalIngredientId).toBeTruthy();
      expect(light.canonicalIngredientId).toBe(query?.canonicalIngredientId);
      expect(dark.canonicalIngredientId).toBe(query?.canonicalIngredientId);
    });
  });

  it("merges close shopping equivalents while preserving attributes", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const light = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "1 cup light brown sugar",
        ingredientText: "light brown sugar",
      });
      const dark = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "1 cup dark brown sugar",
        ingredientText: "dark brown sugar",
      });

      const groups = mergeIngredientsForShopping([
        {
          canonicalIngredientId: light.canonicalIngredientId,
          canonicalDisplayName: light.canonicalDisplayName,
          normalizedIngredientPhrase: light.normalizedIngredientPhrase,
          attributes: light.attributes,
        },
        {
          canonicalIngredientId: dark.canonicalIngredientId,
          canonicalDisplayName: dark.canonicalDisplayName,
          normalizedIngredientPhrase: dark.normalizedIngredientPhrase,
          attributes: dark.attributes,
        },
      ]);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.attributes).toEqual(["dark", "light"]);
    });
  });

  it("creates hierarchy-aware leaf ingredients under a family", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const normalized = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "2 chicken breasts",
        ingredientText: "chicken breast",
      });

      expect(normalized.canonicalDisplayName).toBe("Chicken breast");
      expect(normalized.parentCanonicalDisplayName).toBe("Chicken");
      expect(normalized.ingredientKind).toBe("leaf");
      expect(normalized.matchedBy).toBe("canonical_exact");
    });
  });

  it("expands parent ingredient search to descendant ingredients but keeps child search specific", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      const chickenQuery = resolveIngredientSearchQuery(db, householdId, "chicken");
      const chickenBreastQuery = resolveIngredientSearchQuery(db, householdId, "chicken breast");

      expect(chickenQuery).not.toBeNull();
      expect(chickenBreastQuery).not.toBeNull();
      expect(chickenQuery!.descendantCanonicalIngredientIds.length).toBeGreaterThan(0);
      expect(chickenQuery!.searchCanonicalIngredientIds).toContain(chickenQuery!.canonicalIngredientId);
      expect(chickenQuery!.searchCanonicalIngredientIds).toContain(chickenBreastQuery!.canonicalIngredientId);
      expect(chickenBreastQuery!.descendantCanonicalIngredientIds).toEqual([]);
      expect(chickenBreastQuery!.searchCanonicalIngredientIds).toEqual([chickenBreastQuery!.canonicalIngredientId]);
    });
  });

  it("uses AI fallback suggestions for unresolved composite ingredients", async () => {
    await withTestDatabase(async ({ db, householdId }) => {
      mockGenerateIngredientSuggestionsWithHouseholdAi.mockResolvedValue({
        suggestions: [
          {
            action: "create_new",
            newCanonicalName: "Chili crisp",
            parentCanonicalIngredientId: null,
            ingredientKind: "leaf",
            attributes: [],
            confidence: 76,
            reason: "This looks like a branded condiment that should be reviewed before saving.",
          },
        ],
      });

      const normalized = await normalizeIngredientForHousehold(db, householdId, {
        originalText: "1 tbsp Fly By Jing chili crisp",
        ingredientText: "Fly By Jing chili crisp",
      });

      expect(normalized.normalizationStatus).toBe("needs_review");
      expect(normalized.aiSuggestions[0]?.action).toBe("create_new");
      expect(normalized.aiSuggestions[0]?.newCanonicalName).toBe("Chili crisp");
    });
  });
});
