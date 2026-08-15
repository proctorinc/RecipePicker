import { eq } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import type { DatabaseClient } from "@/src/db/client";
import {
  householdRecipes,
  householdRecipeExtractionAttempts,
  householdRecipeExtractions,
  householdRecipeIngredientAlternatives,
  householdRecipeIngredients,
  householdRecipeInstructions,
  householdRecipeSources,
  householdRecipeSteps,
} from "@/lib/server/db";
import { normalizeIngredientForHousehold } from "@/lib/server/ingredient-normalization";
import { logError, logInfo, logWarn } from "@/lib/server/logger";
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
  failureReason?: string | null;
};

const RECIPE_EXTRACTION_TIMEOUT_MS = 75_000;

export async function extractRecipes(args: ExtractArgs) {
  const { db, sqlite, targetLabel } = await openDatabase(args.sqlitePath);
  const scopedRecipeIds = args.recipeIds ? new Set(args.recipeIds) : null;
  const startedAt = Date.now();

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

    logInfo("recipe_parse.run.started", {
      target: { householdId: args.householdId },
      action: "extract_recipes",
      recipeCount: filteredRows.length,
      rerun: args.rerun ?? false,
      hasRecipeFilter: Boolean(args.recipeId || args.recipeIds),
      hasBoardFilter: Boolean(args.boardId),
    });

    for (const row of filteredRows) {
      const result = await extractRecipeRow(db, args.householdId, row, args.rerun ?? false);
      outcomes.extracted += result.extracted;
      outcomes.reviewNeeded += result.reviewNeeded;
      outcomes.failed += result.failed;
      outcomes.skipped += result.skipped;
    }

    logInfo("recipe_parse.run.completed", {
      target: { householdId: args.householdId },
      action: "extract_recipes",
      durationMs: Date.now() - startedAt,
      result: { status: outcomes.failed > 0 ? "completed_with_failures" : "success", ...outcomes },
    });
    return outcomes;
  } catch (error) {
    logError("recipe_parse.run.failed", error, {
      target: { householdId: args.householdId },
      action: "extract_recipes",
      durationMs: Date.now() - startedAt,
      result: { status: "error" },
    });
    throw error;
  } finally {
    await sqlite.close();
  }
}

export async function extractSingleRecipe(args: {
  householdId: string;
  recipeId: string;
  sqlitePath?: string;
  rerun?: boolean;
  signal?: AbortSignal;
  database?: DatabaseClient;
  databaseOwner?: "single_recipe" | "parse_job_chunk";
  jobId?: string;
  queuePosition?: number;
}): Promise<ExtractSingleRecipeResult> {
  const handle = args.database ? null : await openDatabase(args.sqlitePath);
  const db = args.database ?? handle!.db;
  const deadline = AbortSignal.timeout(RECIPE_EXTRACTION_TIMEOUT_MS);
  const signal = args.signal ? AbortSignal.any([args.signal, deadline]) : deadline;
  let stage = "load_recipe";

  try {
    logInfo("recipe_parse.recipe.requested", {
      target: { householdId: args.householdId, recipeId: args.recipeId },
      action: "load_recipe",
      rerun: args.rerun ?? false,
      jobId: args.jobId ?? null,
      queuePosition: args.queuePosition ?? null,
      databaseOwner: args.databaseOwner ?? "single_recipe",
    });
    const row = await db.query.householdRecipes.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, args.householdId), eq(table.recipeId, args.recipeId)),
      with: {
        pin: true,
        recipeInstructions: true,
      },
    });

    if (!row) {
      logWarn("recipe_parse.recipe.failed", {
        target: { householdId: args.householdId, recipeId: args.recipeId },
        action: "load_recipe",
        reason: "recipe_not_found",
        result: { status: "failed" },
      });
      return {
        outcome: "failed",
        extracted: 0,
        reviewNeeded: 0,
        failed: 1,
        skipped: 0,
        extractionId: null,
      };
    }

    throwIfAborted(signal);
    stage = "extract";
    return extractRecipeRow(db, args.householdId, row, args.rerun ?? false, signal);
  } catch (error) {
    if (args.signal?.aborted) {
      throw error;
    }
    if (deadline.aborted) {
      const failureReason = "extract: Recipe extraction timed out after 75 seconds.";
      logError("recipe_parse.recipe.failed", error, {
        target: { householdId: args.householdId, recipeId: args.recipeId },
        action: stage,
        jobId: args.jobId ?? null,
        queuePosition: args.queuePosition ?? null,
        databaseOwner: args.databaseOwner ?? "single_recipe",
        result: { status: "timed_out" },
      });
      return {
        outcome: "failed",
        extracted: 0,
        reviewNeeded: 0,
        failed: 1,
        skipped: 0,
        extractionId: null,
        failureReason,
      };
    }
    logError("recipe_parse.recipe.failed", error, {
      target: { householdId: args.householdId, recipeId: args.recipeId },
      action: stage,
      jobId: args.jobId ?? null,
      queuePosition: args.queuePosition ?? null,
      databaseOwner: args.databaseOwner ?? "single_recipe",
      result: { status: "error" },
    });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${stage}: ${message}`, { cause: error });
  } finally {
    await handle?.sqlite.close();
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
  signal?: AbortSignal,
): Promise<ExtractSingleRecipeResult> {
  throwIfAborted(signal);
  const startedAt = Date.now();
  const target = { householdId, recipeId: row.recipeId, pinId: row.pinId };
  let stage = "validate_source";
  logInfo("recipe_parse.recipe.started", { target, action: "extract_recipe", rerun });
  if (!row.pin.link) {
    logWarn("recipe_parse.recipe.skipped", {
      target,
      action: "validate_source",
      reason: "missing_source_url",
      result: { status: "skipped" },
    });
    return completeRecipeResult(target, startedAt, {
      outcome: "skipped",
      extracted: 0,
      reviewNeeded: 0,
      failed: 0,
      skipped: 1,
      extractionId: null,
    });
  }

  if (row.recipeInstructions !== null && !rerun) {
    logInfo("recipe_parse.recipe.skipped", {
      target,
      action: "check_existing_recipe",
      reason: "already_extracted",
      result: { status: "skipped" },
    });
    return completeRecipeResult(target, startedAt, {
      outcome: "skipped",
      extracted: 0,
      reviewNeeded: 0,
      failed: 0,
      skipped: 1,
      extractionId: null,
    });
  }

  try {
    stage = "fetch";
    logInfo("recipe_parse.recipe.action_started", { target, action: "fetch_and_extract" });
    const extractionResult = await extractRecipeWithFallbacks(row.pin.link, {
      householdId,
      signal,
      database: db,
    });
    throwIfAborted(signal);
    for (const attempt of extractionResult.attempts) {
      logRecipeAttempt(target, attempt);
    }

    stage = "persist";
    logInfo("recipe_parse.recipe.action_started", { target, action: "persist_sources" });
    const sourceIdsByKey = await persistSourcesForAttempts(
      db,
      householdId,
      row.pinId,
      row.pin.link,
      extractionResult.attempts,
    );
    const selectedSourceId =
      getAttemptSourceId(sourceIdsByKey, extractionResult.fetchStrategy, extractionResult.sourceUrl ?? row.pin.link) ?? null;
    logInfo("recipe_parse.recipe.action_started", { target, action: "persist_extraction" });
    const extractionId = await persistExtractionRow(db, householdId, row.pinId, extractionResult, selectedSourceId);
    throwIfAborted(signal);

    if (extractionId) {
      logInfo("recipe_parse.recipe.action_started", { target, action: "persist_attempts" });
      await persistAttemptRows(
        db,
        householdId,
        row.pinId,
        extractionId,
        extractionResult,
        sourceIdsByKey,
      );
      throwIfAborted(signal);
    }

    // A review flag describes confidence; it must not prevent us from saving
    // the best recipe content and normalizing its ingredients. A later re-run
    // replaces this content (and reparses the ingredients) after it is fixed.
    if (extractionResult.recipe && selectedSourceId) {
      logInfo("recipe_parse.recipe.action_started", { target, action: "persist_recipe_instructions" });
      const reviewCount = await persistRecipeInstructions(
        db,
        householdId,
        row.recipeId,
        selectedSourceId,
        extractionResult,
      );
      throwIfAborted(signal);
      await touchRecipeUpdatedAt(db, row.recipeId);
      return completeRecipeResult(target, startedAt, {
        outcome: reviewCount > 0 || extractionResult.lowConfidence ? "review_needed" : "extracted",
        extracted: 1,
        reviewNeeded: reviewCount > 0 || extractionResult.lowConfidence ? 1 : 0,
        failed: 0,
        skipped: 0,
        extractionId,
      }, extractionResult);
    }

    await touchRecipeUpdatedAt(db, row.recipeId);
    return completeRecipeResult(target, startedAt,
      extractionResult.lowConfidence || extractionResult.status === "multiple_recipes_needs_review"
        ? { outcome: "review_needed", extracted: 0, reviewNeeded: 1, failed: 0, skipped: 0, extractionId }
        : { outcome: "failed", extracted: 0, reviewNeeded: 0, failed: 1, skipped: 0, extractionId },
      extractionResult,
    );
  } catch (error) {
    logError("recipe_parse.recipe.failed", error, {
      target,
      action: stage,
      durationMs: Date.now() - startedAt,
      result: { status: "error" },
    });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${stage}: ${message}`, { cause: error });
  }
}

function logRecipeAttempt(target: Record<string, string>, attempt: ExtractionAttempt) {
  const data = {
    target,
    action: "extract_attempt",
    result: {
      status: attempt.status,
      fetchStrategy: attempt.fetchStrategy,
      contentVariant: attempt.contentVariant,
      extractionStrategy: attempt.extractionStrategy,
      method: attempt.method,
      confidence: attempt.confidence,
      qualityScore: attempt.qualityScore,
      candidateCount: attempt.candidateCount,
      failureReason: attempt.failureReason,
      warningCount: attempt.warnings.length,
    },
  };

  if (attempt.status === "extraction_failed") {
    logError("recipe_parse.recipe.attempt_failed", new Error(attempt.failureReason ?? "Recipe extraction attempt failed."), data);
    return;
  }

  logInfo("recipe_parse.recipe.attempt_completed", data);
}

function completeRecipeResult(
  target: Record<string, string>,
  startedAt: number,
  result: ExtractSingleRecipeResult,
  extractionResult?: ExtractionResult,
) {
  const data = {
    target,
    action: "extract_recipe",
    durationMs: Date.now() - startedAt,
    result: {
      status: result.outcome,
      extractionStatus: extractionResult?.status ?? null,
      failureReason: extractionResult?.failureReason ?? null,
      lowConfidence: extractionResult?.lowConfidence ?? false,
      attemptCount: extractionResult?.attempts.length ?? 0,
    },
  };

  if (result.outcome === "failed") {
    logError("recipe_parse.recipe.failed", new Error(extractionResult?.failureReason ?? "Recipe parsing did not complete successfully."), data);
  } else {
    logInfo("recipe_parse.recipe.completed", data);
  }
  return result;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Recipe extraction cancelled.", "AbortError");
  }
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
      if (ingredient.alternativeIngredientTexts) {
        const alternatives = await Promise.all(
          ingredient.alternativeIngredientTexts.map(async (ingredientText) => {
            const normalization = await normalizeIngredientForHousehold(db, householdId, {
              originalText: ingredient.originalText,
              ingredientText,
            });

            if (normalization.normalizationStatus === "needs_review") {
              reviewCount += 1;
            }

            return { ingredientText, ...normalization };
          }),
        );

        return { ingredient, normalization: null, alternatives };
      }

      const normalization = await normalizeIngredientForHousehold(db, householdId, {
        originalText: ingredient.originalText,
        ingredientText: ingredient.ingredientText,
      });

      if (normalization.normalizationStatus === "needs_review") {
        reviewCount += 1;
      }

      return { ingredient, normalization, alternatives: [] };
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
  await db.delete(householdRecipeIngredientAlternatives).where(eq(householdRecipeIngredientAlternatives.recipeId, recipeId)).run();
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
    for (const [index, item] of normalizedIngredients.entries()) {
      const { ingredient, normalization, alternatives } = item;
      const savedIngredient = await db.insert(householdRecipeIngredients)
        .values({
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
          normalizedIngredientPhrase: normalization?.normalizedIngredientPhrase ?? null,
          canonicalIngredientId: normalization?.canonicalIngredientId ?? null,
          attributesJson: JSON.stringify(normalization?.attributes ?? []),
          matchConfidence: normalization?.matchConfidence ?? null,
          matchedBy: normalization?.matchedBy ?? "alternative_group",
          aiSuggestionsJson: normalization && normalization.aiSuggestions.length > 0 ? JSON.stringify(normalization.aiSuggestions) : null,
          normalizationStatus: normalization?.normalizationStatus ?? "not_ingredient",
        })
        .returning()
        .get();

      if (alternatives.length > 0) {
        await db.insert(householdRecipeIngredientAlternatives)
          .values(alternatives.map((alternative, alternativeIndex) => ({
            householdId,
            recipeId,
            ingredientId: savedIngredient.ingredientId,
            position: alternativeIndex + 1,
            ingredientText: alternative.ingredientText,
            normalizedIngredientPhrase: alternative.normalizedIngredientPhrase,
            canonicalIngredientId: alternative.canonicalIngredientId,
            attributesJson: JSON.stringify(alternative.attributes),
            matchConfidence: alternative.matchConfidence,
            matchedBy: alternative.matchedBy,
            aiSuggestionsJson: alternative.aiSuggestions.length > 0 ? JSON.stringify(alternative.aiSuggestions) : null,
            normalizationStatus: alternative.normalizationStatus,
          })))
          .run();
      }
    }
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
