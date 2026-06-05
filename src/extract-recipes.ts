import process from "node:process";

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createDatabase } from "./db/client.js";
import { baselineLegacySchema } from "./db/migrations.js";
import {
  pins,
  recipeExtractions,
  recipeIngredients,
  recipes,
  recipeSources,
  recipeSteps,
} from "./db/schema.js";
import { extractRecipeFromHtml, fetchRecipePage, type ExtractionResult } from "./recipe-extraction.js";

type Args = {
  sqlitePath?: string;
  pinId?: string;
  boardId?: string;
  rerun: boolean;
};

type OutcomeCounter = {
  extracted: number;
  skipped: number;
  failed: number;
  reviewNeeded: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    rerun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === "--sqlite-path" && nextValue) {
      args.sqlitePath = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--pin-id" && nextValue) {
      args.pinId = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--board-id" && nextValue) {
      args.boardId = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--rerun") {
      args.rerun = true;
      continue;
    }

    throw new Error(
      "Usage: npm run extract:recipes -- [--pin-id <pin-id>] [--board-id <board-id>] [--sqlite-path <path>] [--rerun]",
    );
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { db, sqlite, sqlitePath } = createDatabase(args.sqlitePath);

  try {
    baselineLegacySchema(sqlite);

    migrate(db, {
      migrationsFolder: "drizzle",
    });

    const rows = db
      .select({
        pinId: pins.pinId,
        boardId: pins.boardId,
        link: pins.link,
        existingRecipeId: recipes.recipeId,
      })
      .from(pins)
      .leftJoin(recipes, eq(recipes.pinId, pins.pinId))
      .where(buildWhereClause(args))
      .all();

    const outcomes: OutcomeCounter = {
      extracted: 0,
      skipped: 0,
      failed: 0,
      reviewNeeded: 0,
    };

    for (const row of rows) {
      if (!row.link) {
        outcomes.skipped += 1;
        continue;
      }

      const alreadyExtracted = row.existingRecipeId !== null;

      if (alreadyExtracted && !args.rerun) {
        outcomes.skipped += 1;
        continue;
      }

      const fetchResult = await fetchRecipePage(row.link);
      const sourceId = db
        .insert(recipeSources)
        .values({
          pinId: row.pinId,
          originalUrl: fetchResult.originalUrl,
          finalUrl: fetchResult.finalUrl,
          fetchStatus: fetchResult.fetchStatus,
          contentType: fetchResult.contentType,
          fetchedAt: fetchResult.fetchedAt,
        })
        .returning({ sourceId: recipeSources.sourceId })
        .get()?.sourceId;

      const extractionResult =
        fetchResult.fetchStatus === "fetched" && fetchResult.html
          ? extractRecipeFromHtml(fetchResult.html, fetchResult.finalUrl ?? fetchResult.originalUrl)
          : buildFetchFailureResult(fetchResult.errorMessage, fetchResult.fetchStatus);

      db.insert(recipeExtractions)
        .values({
          pinId: row.pinId,
          sourceId: sourceId ?? null,
          status: extractionResult.status,
          method: extractionResult.method,
          warningsJson: JSON.stringify(extractionResult.warnings),
          candidateCount: extractionResult.candidateCount,
          payloadJson: JSON.stringify({
            ...extractionResult.payload,
            fetchStatus: fetchResult.fetchStatus,
            errorMessage: fetchResult.errorMessage ?? null,
          }),
          createdAt: new Date().toISOString(),
        })
        .run();

      if (extractionResult.status === "recipe_extracted" && extractionResult.recipe && sourceId !== undefined) {
        persistRecipe(row.pinId, sourceId, extractionResult);
        outcomes.extracted += 1;
        continue;
      }

      if (extractionResult.status === "multiple_recipes_needs_review") {
        outcomes.reviewNeeded += 1;
      } else {
        outcomes.failed += 1;
      }
    }

    console.log(
      `Processed ${rows.length} pins from ${sqlitePath}: ${outcomes.extracted} extracted, ${outcomes.reviewNeeded} review-needed, ${outcomes.failed} failed, ${outcomes.skipped} skipped.`,
    );
  } finally {
    sqlite.close();
  }

  function persistRecipe(pinId: string, sourceId: number, extractionResult: ExtractionResult) {
    const recipe = extractionResult.recipe;

    if (!recipe) {
      return;
    }

    const now = new Date().toISOString();

    sqlite.transaction(() => {
      const existingRecipe = db
        .select({ recipeId: recipes.recipeId, createdAt: recipes.createdAt })
        .from(recipes)
        .where(eq(recipes.pinId, pinId))
        .get();

      let recipeId: number;

      if (existingRecipe) {
        db.delete(recipeSteps).where(eq(recipeSteps.recipeId, existingRecipe.recipeId)).run();
        db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, existingRecipe.recipeId)).run();
        db.update(recipes)
          .set({
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
          .where(eq(recipes.recipeId, existingRecipe.recipeId))
          .run();
        recipeId = existingRecipe.recipeId;
      } else {
        recipeId = db
          .insert(recipes)
          .values({
            pinId,
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
          .returning({ recipeId: recipes.recipeId })
          .get()!.recipeId;
      }

      if (recipe.steps.length > 0) {
        db.insert(recipeSteps)
          .values(
            recipe.steps.map((step) => ({
              recipeId,
              position: step.position,
              section: step.section,
              rawText: step.rawText,
              text: step.text,
            })),
          )
          .run();
      }

      if (recipe.ingredients.length > 0) {
        db.insert(recipeIngredients)
          .values(
            recipe.ingredients.map((ingredient, index) => ({
              recipeId,
              position: index + 1,
              originalText: ingredient.originalText,
              amountText: ingredient.amountText,
              unit: ingredient.unit,
              ingredientText: ingredient.ingredientText,
              notes: ingredient.notes,
              normalizationStatus: ingredient.normalizationStatus,
            })),
          )
          .run();
      }
    })();
  }
}

function buildWhereClause(args: Args) {
  const conditions = [isNotNull(pins.link)];

  if (args.pinId) {
    conditions.push(eq(pins.pinId, args.pinId));
  }

  if (args.boardId) {
    conditions.push(eq(pins.boardId, args.boardId));
  }

  return conditions.length === 1 ? conditions[0]! : and(...conditions);
}

function buildFetchFailureResult(errorMessage: string | undefined, fetchStatus: string): ExtractionResult {
  if (fetchStatus === "not_html") {
    return {
      status: "not_recipe",
      method: null,
      warnings: [],
      candidateCount: 0,
      payload: {
        reason: "Linked content was not HTML.",
      },
      recipe: null,
    };
  }

  return {
    status: "extraction_failed",
    method: null,
    warnings: errorMessage ? [errorMessage] : [],
    candidateCount: 0,
    payload: {
      reason: "Page fetch failed.",
    },
    recipe: null,
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
