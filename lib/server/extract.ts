import { eq } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import {
  householdRecipes,
  householdRecipeExtractionAttempts,
  householdRecipeExtractions,
  householdRecipeIngredients,
  householdRecipeInstructions,
  householdRecipeSources,
  householdRecipeSteps,
} from "@/lib/server/db";
import { normalizeIngredientForHousehold } from "@/lib/server/ingredient-normalization";
import { extractRecipeWithFallbacks, type ExtractionAttempt, type ExtractionResult } from "@/lib/server/recipe-parser";

type ExtractArgs = {
  householdId: string;
  sqlitePath?: string;
  recipeId?: string;
  recipeIds?: string[];
  boardId?: string;
  rerun?: boolean;
};

type RecipeExtractionRow = Awaited<ReturnType<typeof loadRecipeExtractionRows>>[number];

export type ExtractSingleRecipeResult = {
  outcome: "extracted" | "review_needed" | "failed" | "skipped";
  extracted: number;
  reviewNeeded: number;
  failed: number;
  skipped: number;
  extractionId: string | null;
};

export async function extractRecipes(args: ExtractArgs) {
  const { db, sqlite, targetLabel } = await openDatabase(args.sqlitePath);
  const scopedRecipeIds = args.recipeIds ? new Set(args.recipeIds) : null;

  try {
    const rows = await loadRecipeExtractionRows(db, args.householdId);

    const filteredRows = rows.filter((row) => {
      if (!row.pin.link) {
        return true;
      }
      if (args.recipeId && row.recipeId !== args.recipeId) {
        return false;
      }
      if (scopedRecipeIds && !scopedRecipeIds.has(row.recipeId)) {
        return false;
      }
      if (args.boardId && row.pin.pinterestBoardId !== args.boardId) {
        return false;
      }
      return true;
    });

    const outcomes = {
      processed: filteredRows.length,
      extracted: 0,
      skipped: 0,
      failed: 0,
      reviewNeeded: 0,
      sqlitePath: targetLabel,
    };

    for (const row of filteredRows) {
      const result = await extractRecipeRow(db, args.householdId, row, args.rerun ?? false);
      outcomes.extracted += result.extracted;
      outcomes.reviewNeeded += result.reviewNeeded;
      outcomes.failed += result.failed;
      outcomes.skipped += result.skipped;
    }

    return outcomes;
  } finally {
    await sqlite.close();
  }
}

export async function extractSingleRecipe(args: {
  householdId: string;
  recipeId: string;
  sqlitePath?: string;
  rerun?: boolean;
}): Promise<ExtractSingleRecipeResult> {
  const { db, sqlite } = await openDatabase(args.sqlitePath);

  try {
    const row = await db.query.householdRecipes.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, args.householdId), eq(table.recipeId, args.recipeId)),
      with: {
        pin: true,
        recipeInstructions: true,
      },
    });

    if (!row) {
      return {
        outcome: "failed",
        extracted: 0,
        reviewNeeded: 0,
        failed: 1,
        skipped: 0,
        extractionId: null,
      };
    }

    return extractRecipeRow(db, args.householdId, row, args.rerun ?? false);
  } finally {
    await sqlite.close();
  }
}

async function loadRecipeExtractionRows(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  householdId: string,
) {
  return db.query.householdRecipes.findMany({
    where: (table, { eq }) => eq(table.householdId, householdId),
    with: {
      pin: true,
      recipeInstructions: true,
    },
  });
}

async function extractRecipeRow(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  householdId: string,
  row: RecipeExtractionRow,
  rerun: boolean,
): Promise<ExtractSingleRecipeResult> {
  if (!row.pin.link) {
    return {
      outcome: "skipped",
      extracted: 0,
      reviewNeeded: 0,
      failed: 0,
      skipped: 1,
      extractionId: null,
    };
  }

  if (row.recipeInstructions !== null && !rerun) {
    return {
      outcome: "skipped",
      extracted: 0,
      reviewNeeded: 0,
      failed: 0,
      skipped: 1,
      extractionId: null,
    };
  }

  const extractionResult = await extractRecipeWithFallbacks(row.pin.link, {
    householdId,
  });
  const sourceIdsByKey = await persistSourcesForAttempts(
    db,
    householdId,
    row.pinId,
    row.pin.link,
    extractionResult.attempts,
  );
  const selectedSourceId =
    getAttemptSourceId(sourceIdsByKey, extractionResult.fetchStrategy, extractionResult.sourceUrl ?? row.pin.link) ?? null;
  const extractionId = await persistExtractionRow(db, householdId, row.pinId, extractionResult, selectedSourceId);

  if (extractionId) {
    await persistAttemptRows(
      db,
      householdId,
      row.pinId,
      extractionId,
      extractionResult,
      sourceIdsByKey,
    );
  }

  if (extractionResult.status === "recipe_extracted" && extractionResult.recipe && selectedSourceId) {
    const reviewCount = await persistRecipeInstructions(
      db,
      householdId,
      row.recipeId,
      selectedSourceId,
      extractionResult,
    );
    await touchRecipeUpdatedAt(db, row.recipeId);
    return {
      outcome: reviewCount > 0 || extractionResult.lowConfidence ? "review_needed" : "extracted",
      extracted: 1,
      reviewNeeded: reviewCount > 0 || extractionResult.lowConfidence ? 1 : 0,
      failed: 0,
      skipped: 0,
      extractionId,
    };
  }

  await touchRecipeUpdatedAt(db, row.recipeId);
  if (extractionResult.lowConfidence || extractionResult.status === "multiple_recipes_needs_review") {
    return {
      outcome: "review_needed",
      extracted: 0,
      reviewNeeded: 1,
      failed: 0,
      skipped: 0,
      extractionId,
    };
  }

  return {
    outcome: "failed",
    extracted: 0,
    reviewNeeded: 0,
    failed: 1,
    skipped: 0,
    extractionId,
  };
}

async function persistExtractionRow(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  householdId: string,
  pinId: string,
  extractionResult: ExtractionResult,
  selectedSourceId: string | null,
) {
  return (
    await db
      .insert(householdRecipeExtractions)
      .values({
        householdId,
        pinId,
        sourceId: selectedSourceId,
        status: extractionResult.status,
        method: extractionResult.method,
        fetchStrategy: extractionResult.fetchStrategy,
        contentVariant: extractionResult.contentVariant,
        extractionStrategy: extractionResult.extractionStrategy,
        qualityScore: extractionResult.qualityScore,
        confidence: extractionResult.confidence,
        selected: extractionResult.selected,
        lowConfidence: extractionResult.lowConfidence,
        failureReason: extractionResult.failureReason,
        warningsJson: JSON.stringify(extractionResult.warnings),
        qualitySignalsJson: extractionResult.qualitySignals
          ? JSON.stringify(extractionResult.qualitySignals)
          : null,
        candidateCount: extractionResult.candidateCount,
        payloadJson: JSON.stringify(extractionResult.payload),
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get()
  )?.extractionId ?? null;
}

async function touchRecipeUpdatedAt(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  recipeId: string,
) {
  await db.update(householdRecipes)
    .set({
      updatedAt: new Date().toISOString(),
    })
    .where(eq(householdRecipes.recipeId, recipeId))
    .run();
}

async function persistRecipeInstructions(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  householdId: string,
  recipeId: string,
  sourceId: string,
  extractionResult: ExtractionResult,
): Promise<number> {
  const recipe = extractionResult.recipe;

  if (!recipe) {
    return 0;
  }

  const now = new Date().toISOString();
  let reviewCount = 0;
  const normalizedIngredients = await Promise.all(
    recipe.ingredients.map(async (ingredient) => {
      const normalization = await normalizeIngredientForHousehold(db, householdId, {
        originalText: ingredient.originalText,
        ingredientText: ingredient.ingredientText,
      });

      if (normalization.normalizationStatus === "needs_review") {
        reviewCount += 1;
      }

      return {
        ...ingredient,
        ...normalization,
      };
    }),
  );

  const existingInstructions = await db.query.householdRecipeInstructions.findFirst({
      where: (table, { eq }) => eq(table.recipeId, recipeId),
      columns: {
        recipeId: true,
        createdAt: true,
      },
    });

  await db.delete(householdRecipeSteps).where(eq(householdRecipeSteps.recipeId, recipeId)).run();
  await db.delete(householdRecipeIngredients).where(eq(householdRecipeIngredients.recipeId, recipeId)).run();

  if (existingInstructions) {
    await db.update(householdRecipeInstructions)
      .set({
        householdId,
        sourceId,
        title: recipe.title,
        description: recipe.description,
        author: recipe.author,
        canonicalUrl: recipe.canonicalUrl,
        siteName: recipe.siteName,
        imageUrl: recipe.imageUrl,
        yieldText: recipe.yieldText,
        prepTime: recipe.prepTime,
        cookTime: recipe.cookTime,
        totalTime: recipe.totalTime,
        categoriesJson: JSON.stringify(recipe.categories),
        cuisine: recipe.cuisine,
        keywordsJson: JSON.stringify(recipe.keywords),
        nutritionJson: recipe.nutrition ? JSON.stringify(recipe.nutrition) : null,
        rawRecipeJson: JSON.stringify(recipe.rawRecipe),
        updatedAt: now,
      })
      .where(eq(householdRecipeInstructions.recipeId, recipeId))
      .run();
  } else {
    await db.insert(householdRecipeInstructions)
      .values({
        recipeId,
        householdId,
        sourceId,
        title: recipe.title,
        description: recipe.description,
        author: recipe.author,
        canonicalUrl: recipe.canonicalUrl,
        siteName: recipe.siteName,
        imageUrl: recipe.imageUrl,
        yieldText: recipe.yieldText,
        prepTime: recipe.prepTime,
        cookTime: recipe.cookTime,
        totalTime: recipe.totalTime,
        categoriesJson: JSON.stringify(recipe.categories),
        cuisine: recipe.cuisine,
        keywordsJson: JSON.stringify(recipe.keywords),
        nutritionJson: recipe.nutrition ? JSON.stringify(recipe.nutrition) : null,
        rawRecipeJson: JSON.stringify(recipe.rawRecipe),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  if (recipe.steps.length > 0) {
    await db.insert(householdRecipeSteps)
      .values(
        recipe.steps.map((step) => ({
          householdId,
          recipeId,
          position: step.position,
          section: step.section,
          rawText: step.rawText,
          text: step.text,
        })),
      )
      .run();
  }

  if (normalizedIngredients.length > 0) {
    await db.insert(householdRecipeIngredients)
      .values(
        normalizedIngredients.map((ingredient, index) => ({
          householdId,
          recipeId,
          position: index + 1,
          originalText: ingredient.originalText,
          amountText: ingredient.amountText,
          amountValue: ingredient.amountValue,
          amountMaxValue: ingredient.amountMaxValue,
          unit: ingredient.unit,
          ingredientText: ingredient.ingredientText,
          notes: ingredient.notes,
          normalizedIngredientPhrase: ingredient.normalizedIngredientPhrase,
          canonicalIngredientId: ingredient.canonicalIngredientId,
          attributesJson: JSON.stringify(ingredient.attributes),
          matchConfidence: ingredient.matchConfidence,
          matchedBy: ingredient.matchedBy,
          aiSuggestionsJson: ingredient.aiSuggestions.length > 0 ? JSON.stringify(ingredient.aiSuggestions) : null,
          normalizationStatus: ingredient.normalizationStatus,
        })),
      )
      .run();
  }

  return reviewCount;
}

async function persistSourcesForAttempts(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  householdId: string,
  pinId: string,
  originalUrl: string,
  attempts: ExtractionAttempt[],
) {
  const sourceIdsByKey = new Map<string, string>();

  for (const attempt of attempts) {
    const sourceUrl = attempt.sourceUrl ?? originalUrl;
    const key = `${attempt.fetchStrategy}|${sourceUrl}`;
    if (sourceIdsByKey.has(key)) {
      continue;
    }

    const fetchStatus =
      attempt.failureReason === "Linked content was not HTML."
        ? "not_html"
        : attempt.failureReason === "Page fetch failed." || attempt.status === "extraction_failed"
          ? "fetch_failed"
          : "fetched";

    const sourceId = (
      await db
        .insert(householdRecipeSources)
        .values({
          householdId,
          pinId,
          originalUrl,
          finalUrl: sourceUrl,
          fetchStatus,
          contentType: sourceUrl ? "text/html" : null,
          pagePreviewDataUrl: attempt.pagePreviewDataUrl ?? null,
          fetchedAt: attempt.fetchedAt,
        })
        .returning()
        .get()
    )?.sourceId;

    if (sourceId) {
      sourceIdsByKey.set(key, sourceId);
    }
  }

  return sourceIdsByKey;
}

function getAttemptSourceId(sourceIdsByKey: Map<string, string>, fetchStrategy: string | null, sourceUrl: string | null) {
  if (!fetchStrategy || !sourceUrl) {
    return null;
  }
  return sourceIdsByKey.get(`${fetchStrategy}|${sourceUrl}`) ?? null;
}

async function persistAttemptRows(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  householdId: string,
  pinId: string,
  extractionId: string,
  extractionResult: ExtractionResult,
  sourceIdsByKey: Map<string, string>,
) {
  const selectedKey = `${extractionResult.fetchStrategy ?? ""}|${extractionResult.sourceUrl ?? ""}|${extractionResult.extractionStrategy ?? ""}|${extractionResult.method ?? ""}`;

  if (extractionResult.attempts.length === 0) {
    return;
  }

  await db.insert(householdRecipeExtractionAttempts)
    .values(
      extractionResult.attempts.map((attempt) => ({
        extractionId,
        householdId,
        pinId,
        sourceId: getAttemptSourceId(sourceIdsByKey, attempt.fetchStrategy, attempt.sourceUrl) ?? null,
        status: attempt.status,
        method: attempt.method,
        fetchStrategy: attempt.fetchStrategy,
        contentVariant: attempt.contentVariant,
        extractionStrategy: attempt.extractionStrategy,
        qualityScore: attempt.qualityScore,
        confidence: attempt.confidence,
        selected:
          `${attempt.fetchStrategy}|${attempt.sourceUrl ?? ""}|${attempt.extractionStrategy ?? ""}|${attempt.method ?? ""}` === selectedKey,
        failureReason: attempt.failureReason,
        warningsJson: JSON.stringify(attempt.warnings),
        qualitySignalsJson: attempt.qualitySignals ? JSON.stringify(attempt.qualitySignals) : null,
        payloadJson: JSON.stringify(attempt.payload),
        createdAt: attempt.fetchedAt,
      })),
    )
    .run();
}
