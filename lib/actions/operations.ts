"use server";

import crypto from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";

import {
  canConfigureAi,
  getAppAccessContext,
  normalizeSubscriptionTier,
  requireAdminAccess,
  upsertUserSubscriptionTier,
} from "@/lib/server/access";
import { addMemberToHousehold, requireHouseholdContext, requireHouseholdRole } from "@/lib/server/auth";
import { openDatabase } from "@/lib/server/database";
import {
  householdInvites,
  householdMembers,
  householdRecipeExtractionFeedback,
  householdRecipeFeedback,
  householdRecipeIngredients,
  householdRecipeReviews,
  householdRecipeSteps,
  householdRecipes,
} from "@/lib/server/db";
import {
  createCanonicalIngredient,
  normalizeAttributes,
  upsertReviewedIngredientMapping,
  type IngredientKind,
} from "@/lib/server/ingredient-normalization";
import {
  disconnectHouseholdAiConnection,
  getAiModelCatalog,
  getStoredHouseholdAiKey,
  testHouseholdAiConnection,
  type AiProvider,
  upsertHouseholdAiConnection,
} from "@/lib/server/ai-provider";
import { disconnectPinterestConnection } from "@/lib/server/pinterest";
import { getRecipeHouseholdPinId } from "@/lib/server/queries";
import { extractRecipes } from "@/lib/server/extract";
import { revalidateAll, recipeScopedPaths, toErrorState, toOptionalString } from "@/lib/actions/helpers";
import type { ActionState } from "@/lib/actions/types";
import type { IngredientReviewSuggestionView, RecipeExtractionFeedbackCategory } from "@/types/view-models";

export async function extractRecipeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runRecipeExtraction(formData, false);
}

export async function rerunRecipeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runRecipeExtraction(formData, true);
}

export async function rerunRecipesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const rawRecipeIds = String(formData.get("recipeIds") ?? "");

  let recipeIds: string[] = [];

  try {
    const parsed = JSON.parse(rawRecipeIds);
    recipeIds = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    return { status: "error", message: "Recipe selection is invalid." };
  }

  if (recipeIds.length === 0) {
    return { status: "error", message: "Choose at least one recipe to re-parse." };
  }

  const context = await requireHouseholdContext();
  const { db, sqlite } = openDatabase();

  try {
    const existingRecipes = db.query.householdRecipes.findMany({
      where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), inArray(table.recipeId, recipeIds)),
      columns: {
        recipeId: true,
      },
    }).sync();
    const allowedRecipeIds = existingRecipes.map((recipe) => recipe.recipeId);

    if (allowedRecipeIds.length === 0) {
      return { status: "error", message: "No matching recipes were found." };
    }

    let extracted = 0;
    let reviewNeeded = 0;
    let failed = 0;

    for (const recipeId of allowedRecipeIds) {
      const result = await extractRecipes({ householdId: context.householdId, recipeId, rerun: true });
      extracted += result.extracted;
      reviewNeeded += result.reviewNeeded;
      failed += result.failed;
    }

    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: `Re-parsed ${allowedRecipeIds.length} recipes. Extracted ${extracted}, review ${reviewNeeded}, failed ${failed}.`,
    };
  } catch (error) {
    return toErrorState(error, "Unable to re-parse the selected recipes.");
  } finally {
    sqlite.close();
  }
}

export async function createInviteAction(_: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const context = await requireHouseholdRole("owner");
    const { db, sqlite } = openDatabase();
    const token = crypto.randomUUID();
    const now = new Date();

    try {
      db.insert(householdInvites)
        .values({
          inviteToken: token,
          householdId: context.householdId,
          createdByClerkUserId: context.clerkUserId,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          consumedAt: null,
          consumedByClerkUserId: null,
        })
        .run();
    } finally {
      sqlite.close();
    }

    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: "Created a fresh household invite link.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to create an invite.");
  }
}

export async function disconnectPinterestAction(_: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const context = await requireHouseholdRole("owner");
    await disconnectPinterestConnection(context.householdId);
    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: "Disconnected Pinterest for this household.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to disconnect Pinterest.");
  }
}

export async function saveAiConnectionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const rawProvider = String(formData.get("provider") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const newApiKey = String(formData.get("apiKey") ?? "").trim();

  try {
    const appAccess = await getAppAccessContext();
    const context = await requireHouseholdRole("owner");

    if (!canConfigureAi({
      subscriptionTier: appAccess.subscriptionTier,
      householdRole: context.role,
    })) {
      return {
        status: "error",
        message: "Premium is required to configure the shared AI connection.",
      };
    }

    if (!isAiProvider(rawProvider)) {
      return { status: "error", message: "Choose a supported AI provider." };
    }

    const modelCatalog = getAiModelCatalog()[rawProvider];
    if (!modelCatalog.some((option) => option.id === model)) {
      return { status: "error", message: "Choose a supported model for that provider." };
    }

    const apiKey = newApiKey || (await getStoredHouseholdAiKey(context.householdId));
    if (!apiKey) {
      return { status: "error", message: "Enter an API key to connect this provider." };
    }

    const testResult = await testHouseholdAiConnection({
      provider: rawProvider,
      model,
      apiKey,
    });

    await upsertHouseholdAiConnection({
      householdId: context.householdId,
      connectedByClerkUserId: context.clerkUserId,
      provider: rawProvider,
      model,
      apiKey,
      connectionStatus: testResult.status,
      lastTestStatus: testResult.ok ? "success" : "error",
      lastTestError: testResult.error,
    });

    revalidateAll(recipeScopedPaths());

    if (!testResult.ok) {
      return {
        status: "error",
        message: `Unable to validate the AI connection. ${testResult.error ?? ""}`.trim(),
      };
    }

    return {
      status: "success",
      message: "Saved and validated the household AI connection.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save the AI connection.");
  }
}

export async function disconnectAiConnectionAction(_: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const appAccess = await getAppAccessContext();
    const context = await requireHouseholdRole("owner");

    if (!canConfigureAi({
      subscriptionTier: appAccess.subscriptionTier,
      householdRole: context.role,
    })) {
      return {
        status: "error",
        message: "Premium is required to configure the shared AI connection.",
      };
    }

    await disconnectHouseholdAiConnection(context.householdId);
    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: "Disconnected the household AI connection.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to disconnect the AI connection.");
  }
}

export async function updateSubscriptionTierAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const requestedTier = normalizeSubscriptionTier(formData.get("subscriptionTier"));
  const rawTier = String(formData.get("subscriptionTier") ?? "").trim();

  if (rawTier !== "free" && rawTier !== "premium") {
    return { status: "error", message: "Choose either the free or premium tier." };
  }

  try {
    const access = await requireAdminAccess();
    await upsertUserSubscriptionTier({
      clerkUserId: access.clerkUserId,
      subscriptionTier: requestedTier,
    });
    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: `Your subscription tier is now ${requestedTier}.`,
    };
  } catch (error) {
    return toErrorState(error, "Unable to update the subscription tier.");
  }
}

export async function joinHouseholdInviteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const inviteToken = String(formData.get("inviteToken") ?? "").trim();

  if (!inviteToken) {
    return { status: "error", message: "Invite token is required." };
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      return { status: "error", message: "You need to sign in before joining a household." };
    }

    const { db, sqlite } = openDatabase();

    try {
      const invite = db.query.householdInvites.findFirst({
        where: (table, { eq }) => eq(table.inviteToken, inviteToken),
      }).sync();

      if (!invite) {
        return { status: "error", message: "Invite not found." };
      }

      if (invite.consumedAt) {
        return { status: "error", message: "Invite has already been used." };
      }

      if (new Date(invite.expiresAt).getTime() < Date.now()) {
        return { status: "error", message: "Invite has expired." };
      }

      db.delete(householdMembers).where(eq(householdMembers.clerkUserId, userId)).run();
      await addMemberToHousehold(invite.householdId, userId, "member");

      db.update(householdInvites)
        .set({
          consumedAt: new Date().toISOString(),
          consumedByClerkUserId: userId,
        })
        .where(eq(householdInvites.inviteToken, inviteToken))
        .run();
    } finally {
      sqlite.close();
    }

    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: "Joined the shared household.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to join this household.");
  }
}

export async function reviewIngredientAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const ingredientId = String(formData.get("ingredientId") ?? "").trim();
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const normalizedPhrase = String(formData.get("normalizedIngredientPhrase") ?? "").trim();
  const selectedCanonicalIngredientId = String(formData.get("canonicalIngredientId") ?? "").trim() || null;
  const newCanonicalName = String(formData.get("newCanonicalName") ?? "").trim() || null;
  const parentCanonicalIngredientId = String(formData.get("parentCanonicalIngredientId") ?? "").trim() || null;
  const aliasText = String(formData.get("aliasText") ?? "").trim() || null;
  const ingredientKind = toIngredientKind(String(formData.get("ingredientKind") ?? "").trim());
  const reviewMode = toReviewMode(String(formData.get("reviewMode") ?? "").trim());
  const savePhraseMapping = toChecked(formData.get("savePhraseMapping"));
  const saveAlias = toChecked(formData.get("saveAlias"));
  const acceptCurrentSuggestion = toChecked(formData.get("acceptCurrentSuggestion"));
  const acceptSuggestionIndex = Number.parseInt(String(formData.get("acceptSuggestionIndex") ?? ""), 10);
  const aiSuggestions = parseIngredientReviewSuggestions(formData.get("aiSuggestionsJson"));
  const attributes = normalizeAttributes(
    String(formData.get("attributes") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  if (!ingredientId || !recipeId) {
    return { status: "error", message: "Ingredient review details are incomplete." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = openDatabase();

    try {
      const ingredient = db.query.householdRecipeIngredients.findFirst({
        where: (table, { and, eq }) =>
          and(eq(table.householdId, context.householdId), eq(table.ingredientId, ingredientId), eq(table.recipeId, recipeId)),
      }).sync();

      if (!ingredient) {
        return { status: "error", message: "Ingredient review item was not found." };
      }

      const acceptedSuggestion =
        Number.isInteger(acceptSuggestionIndex) && acceptSuggestionIndex >= 0 ? aiSuggestions[acceptSuggestionIndex] ?? null : null;
      const resolvedReview = resolveReviewSubmission({
        selectedCanonicalIngredientId,
        newCanonicalName,
        parentCanonicalIngredientId,
        ingredientKind,
        attributes,
        reviewMode,
        acceptedSuggestion,
        acceptCurrentSuggestion,
        fallbackSuggestedCanonicalIngredientId: String(formData.get("fallbackSuggestedCanonicalIngredientId") ?? "").trim() || null,
        fallbackSuggestedCanonicalName: String(formData.get("fallbackSuggestedCanonicalName") ?? "").trim() || null,
        fallbackSuggestedParentCanonicalIngredientId:
          String(formData.get("fallbackSuggestedParentCanonicalIngredientId") ?? "").trim() || null,
        fallbackSuggestedIngredientKind: toIngredientKind(String(formData.get("fallbackSuggestedIngredientKind") ?? "").trim()),
        fallbackSuggestedAttributes: normalizeAttributes(
          String(formData.get("fallbackSuggestedAttributes") ?? "")
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        ),
      });

      if (!resolvedReview) {
        return { status: "error", message: "Choose an existing ingredient, accept a suggestion, or create a new one." };
      }

      const canonicalIngredient =
        resolvedReview.mode === "create_new"
          ? createCanonicalIngredient(db, context.householdId, resolvedReview.displayName, {
              parentCanonicalIngredientId: resolvedReview.parentCanonicalIngredientId,
              ingredientKind: resolvedReview.ingredientKind,
            })
          : { canonicalIngredientId: resolvedReview.canonicalIngredientId };

      upsertReviewedIngredientMapping({
        db,
        householdId: context.householdId,
        normalizedPhrase: normalizedPhrase || ingredient.normalizedIngredientPhrase || ingredient.originalText,
        canonicalIngredientId: canonicalIngredient.canonicalIngredientId,
        aliasText: aliasText || ingredient.originalText,
        attributes: resolvedReview.attributes,
        savePhraseMapping,
        saveAlias,
      });

      db.update(householdRecipeIngredients)
        .set({
          canonicalIngredientId: canonicalIngredient.canonicalIngredientId,
          attributesJson: JSON.stringify(resolvedReview.attributes),
          matchConfidence: 100,
          matchedBy: "confirmed_review",
          aiSuggestionsJson: null,
          normalizationStatus: "confirmed",
        })
        .where(
          and(
            eq(householdRecipeIngredients.householdId, context.householdId),
            eq(
              householdRecipeIngredients.normalizedIngredientPhrase,
              normalizedPhrase || ingredient.normalizedIngredientPhrase || ingredient.originalText,
            ),
          ),
        )
        .run();
    } finally {
      sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId).concat("/settings/ingredients"));
    return {
      status: "success",
      message: "Ingredient mapping confirmed and saved for future imports.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save the ingredient review.");
  }
}

export async function saveRecipeContentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const ingredients = parseRecipeContentItems(formData.get("ingredientsJson"), isRecipeIngredientInput);
  const steps = parseRecipeContentItems(formData.get("stepsJson"), isRecipeStepInput);

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        with: {
          recipeInstructions: {
            with: {
              ingredients: {
                columns: {
                  ingredientId: true,
                },
              },
              steps: {
                columns: {
                  stepId: true,
                },
              },
            },
          },
        },
      }).sync();

      if (!recipe?.recipeInstructions) {
        return { status: "error", message: "This recipe does not have editable structured content yet." };
      }

      const knownIngredientIds = new Set(recipe.recipeInstructions.ingredients.map((ingredient) => ingredient.ingredientId));
      const knownStepIds = new Set(recipe.recipeInstructions.steps.map((step) => step.stepId));

      for (const ingredient of ingredients) {
        if (!knownIngredientIds.has(ingredient.id) || !ingredient.originalText.trim()) {
          return { status: "error", message: "One or more ingredient edits are invalid." };
        }
      }

      for (const step of steps) {
        if (!knownStepIds.has(step.id) || !step.text.trim()) {
          return { status: "error", message: "One or more instruction edits are invalid." };
        }
      }

      for (const ingredient of ingredients) {
        db.update(householdRecipeIngredients)
          .set({
            originalText: ingredient.originalText.trim(),
            notes: ingredient.notes?.trim() || null,
          })
          .where(and(eq(householdRecipeIngredients.recipeId, recipeId), eq(householdRecipeIngredients.ingredientId, ingredient.id)))
          .run();
      }

      for (const step of steps) {
        db.update(householdRecipeSteps)
          .set({
            section: step.section?.trim() || null,
            text: step.text.trim(),
          })
          .where(and(eq(householdRecipeSteps.recipeId, recipeId), eq(householdRecipeSteps.stepId, step.id)))
          .run();
      }

      db.update(householdRecipes)
        .set({
          updatedAt: now,
        })
        .where(and(eq(householdRecipes.recipeId, recipeId), eq(householdRecipes.householdId, context.householdId)))
        .run();
    } finally {
      sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Saved the recipe content updates.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save the recipe content.");
  }
}

export async function saveRecipeFeedbackAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const summary = toOptionalString(formData.get("summary"));
  const note = toOptionalString(formData.get("note"));

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  if (!summary && !note) {
    return { status: "error", message: "Add a summary or note before saving recipe guidance." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        columns: {
          recipeId: true,
        },
        with: {
          feedback: true,
        },
      }).sync();

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      if (recipe.feedback) {
        db.update(householdRecipeFeedback)
          .set({
            summary,
            note,
            updatedByClerkUserId: context.clerkUserId,
            updatedAt: now,
          })
          .where(eq(householdRecipeFeedback.feedbackId, recipe.feedback.feedbackId))
          .run();
      } else {
        db.insert(householdRecipeFeedback)
          .values({
            householdId: context.householdId,
            recipeId,
            summary,
            note,
            createdByClerkUserId: context.clerkUserId,
            updatedByClerkUserId: context.clerkUserId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    } finally {
      sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Saved reusable recipe guidance.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save recipe guidance.");
  }
}

export async function saveExtractionFeedbackAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const extractionId = toOptionalString(formData.get("extractionId"));
  const category = toRecipeExtractionFeedbackCategory(String(formData.get("category") ?? "").trim());
  const note = toOptionalString(formData.get("note"));

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  if (!category) {
    return { status: "error", message: "Choose the kind of issue you are reporting." };
  }

  if (!note) {
    return { status: "error", message: "Describe what happened before saving feedback." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        with: {
          pin: {
            with: {
              recipeExtractions: {
                columns: {
                  extractionId: true,
                },
              },
            },
          },
        },
      }).sync();

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      if (extractionId) {
        const allowedExtractionIds = new Set(recipe.pin.recipeExtractions.map((extraction) => extraction.extractionId));
        if (!allowedExtractionIds.has(extractionId)) {
          return { status: "error", message: "That run is no longer available for feedback." };
        }
      }

      db.insert(householdRecipeExtractionFeedback)
        .values({
          householdId: context.householdId,
          recipeId,
          extractionId,
          category,
          note,
          createdByClerkUserId: context.clerkUserId,
          createdAt: now,
        })
        .run();
    } finally {
      sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Saved run feedback for future parsing reviews.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save run feedback.");
  }
}

export async function createRecipeReviewAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const ratingValue = parseRatingValue(formData.get("ratingValue"));
  const eatenOn = toOptionalString(formData.get("eatenOn"));
  const note = toOptionalString(formData.get("note"));

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  if (!ratingValue) {
    return { status: "error", message: "Choose a rating between 0.5 and 5 stars." };
  }

  if (eatenOn && !isValidReviewDate(eatenOn)) {
    return { status: "error", message: "Choose the date you ate this meal." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        columns: {
          recipeId: true,
          pinId: true,
        },
      }).sync();

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      db.insert(householdRecipeReviews)
        .values({
          householdId: context.householdId,
          recipeId: recipe.recipeId,
          reviewedByClerkUserId: context.clerkUserId,
          ratingValue,
          eatenOn,
          note,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } finally {
      sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Review saved to meal history.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save this review.");
  }
}

export async function updateRecipeReviewAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const ratingValue = parseRatingValue(formData.get("ratingValue"));
  const eatenOn = toOptionalString(formData.get("eatenOn"));
  const note = toOptionalString(formData.get("note"));

  if (!reviewId) {
    return { status: "error", message: "Review ID is required." };
  }

  if (!ratingValue) {
    return { status: "error", message: "Choose a rating between 0.5 and 5 stars." };
  }

  if (eatenOn && !isValidReviewDate(eatenOn)) {
    return { status: "error", message: "Choose the date you ate this meal." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = openDatabase();

    try {
      const review = db.query.householdRecipeReviews.findFirst({
        where: (table, { and, eq }) => and(eq(table.reviewId, reviewId), eq(table.householdId, context.householdId)),
      }).sync();

      if (!review) {
        return { status: "error", message: "Review was not found." };
      }

      if (!canManageRecipeReview(context, review.reviewedByClerkUserId)) {
        return { status: "error", message: "You do not have permission to edit this review." };
      }

      db.update(householdRecipeReviews)
        .set({
          ratingValue,
          eatenOn,
          note,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(householdRecipeReviews.reviewId, reviewId))
        .run();

      revalidateAll(recipeScopedPaths(undefined, review.recipeId));
      return {
        status: "success",
        message: "Review updated.",
      };
    } finally {
      sqlite.close();
    }
  } catch (error) {
    return toErrorState(error, "Unable to update this review.");
  }
}

export async function deleteRecipeReviewAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const reviewId = String(formData.get("reviewId") ?? "").trim();

  if (!reviewId) {
    return { status: "error", message: "Review ID is required." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = openDatabase();

    try {
      const review = db.query.householdRecipeReviews.findFirst({
        where: (table, { and, eq }) => and(eq(table.reviewId, reviewId), eq(table.householdId, context.householdId)),
      }).sync();

      if (!review) {
        return { status: "error", message: "Review was not found." };
      }

      if (!canManageRecipeReview(context, review.reviewedByClerkUserId)) {
        return { status: "error", message: "You do not have permission to delete this review." };
      }

      db.delete(householdRecipeReviews).where(eq(householdRecipeReviews.reviewId, reviewId)).run();

      revalidateAll(recipeScopedPaths(undefined, review.recipeId));
      return {
        status: "success",
        message: "Review deleted.",
      };
    } finally {
      sqlite.close();
    }
  } catch (error) {
    return toErrorState(error, "Unable to delete this review.");
  }
}

type ReviewMode = "match_existing" | "create_new";
type RecipeIngredientInput = { id: string; originalText: string; notes: string | null };
type RecipeStepInput = { id: string; section: string | null; text: string };

function toReviewMode(value: string): ReviewMode {
  return value === "create_new" ? "create_new" : "match_existing";
}

function toChecked(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function toIngredientKind(value: string): IngredientKind | null {
  if (value === "family" || value === "base" || value === "leaf") {
    return value;
  }

  return null;
}

function toRecipeExtractionFeedbackCategory(value: string): RecipeExtractionFeedbackCategory | null {
  if (
    value === "missing_ingredients" ||
    value === "missing_steps" ||
    value === "wrong_order" ||
    value === "wrong_recipe_selected" ||
    value === "formatting_only" ||
    value === "source_problem" ||
    value === "other"
  ) {
    return value;
  }

  return null;
}

function parseIngredientReviewSuggestions(value: FormDataEntryValue | null): IngredientReviewSuggestionView[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(isIngredientReviewSuggestion) : [];
  } catch {
    return [];
  }
}

function parseRecipeContentItems<T>(
  value: FormDataEntryValue | null,
  validator: (item: unknown) => item is T,
): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(validator) : [];
  } catch {
    return [];
  }
}

function isRecipeIngredientInput(value: unknown): value is RecipeIngredientInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.originalText === "string" && (typeof item.notes === "string" || item.notes === null);
}

function isRecipeStepInput(value: unknown): value is RecipeStepInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.text === "string" && (typeof item.section === "string" || item.section === null);
}

function isIngredientReviewSuggestion(value: unknown): value is IngredientReviewSuggestionView {
  if (!value || typeof value !== "object") {
    return false;
  }

  const suggestion = value as Record<string, unknown>;

  return (
    (suggestion.action === "match_existing" ||
      suggestion.action === "create_new" ||
      suggestion.action === "keep_unresolved") &&
    typeof suggestion.confidence === "number" &&
    typeof suggestion.reason === "string"
  );
}

function resolveReviewSubmission(input: {
  selectedCanonicalIngredientId: string | null;
  newCanonicalName: string | null;
  parentCanonicalIngredientId: string | null;
  ingredientKind: IngredientKind | null;
  attributes: string[];
  reviewMode: ReviewMode;
  acceptedSuggestion: IngredientReviewSuggestionView | null;
  acceptCurrentSuggestion: boolean;
  fallbackSuggestedCanonicalIngredientId: string | null;
  fallbackSuggestedCanonicalName: string | null;
  fallbackSuggestedParentCanonicalIngredientId: string | null;
  fallbackSuggestedIngredientKind: IngredientKind | null;
  fallbackSuggestedAttributes: string[];
}) {
  if (input.acceptedSuggestion) {
    if (input.acceptedSuggestion.action === "match_existing" && input.acceptedSuggestion.canonicalIngredientId) {
      return {
        mode: "match_existing" as const,
        canonicalIngredientId: input.acceptedSuggestion.canonicalIngredientId,
        attributes: normalizeAttributes(input.acceptedSuggestion.attributes),
      };
    }

    if (input.acceptedSuggestion.action === "create_new" && input.acceptedSuggestion.newCanonicalName) {
      return {
        mode: "create_new" as const,
        displayName: input.acceptedSuggestion.newCanonicalName,
        parentCanonicalIngredientId: input.acceptedSuggestion.parentCanonicalIngredientId,
        ingredientKind: input.acceptedSuggestion.ingredientKind ?? (input.acceptedSuggestion.parentCanonicalIngredientId ? "leaf" : "leaf"),
        attributes: normalizeAttributes(input.acceptedSuggestion.attributes),
      };
    }
  }

  if (input.acceptCurrentSuggestion) {
    if (input.fallbackSuggestedCanonicalIngredientId) {
      return {
        mode: "match_existing" as const,
        canonicalIngredientId: input.fallbackSuggestedCanonicalIngredientId,
        attributes: input.fallbackSuggestedAttributes,
      };
    }

    if (input.fallbackSuggestedCanonicalName) {
      return {
        mode: "create_new" as const,
        displayName: input.fallbackSuggestedCanonicalName,
        parentCanonicalIngredientId: input.fallbackSuggestedParentCanonicalIngredientId,
        ingredientKind: input.fallbackSuggestedIngredientKind ?? (input.fallbackSuggestedParentCanonicalIngredientId ? "leaf" : "leaf"),
        attributes: input.fallbackSuggestedAttributes,
      };
    }
  }

  if (input.reviewMode === "create_new") {
    if (!input.newCanonicalName) {
      return null;
    }

    return {
      mode: "create_new" as const,
      displayName: input.newCanonicalName,
      parentCanonicalIngredientId: input.parentCanonicalIngredientId,
      ingredientKind: input.ingredientKind ?? (input.parentCanonicalIngredientId ? "leaf" : "leaf"),
      attributes: input.attributes,
    };
  }

  if (!input.selectedCanonicalIngredientId) {
    return null;
  }

  return {
    mode: "match_existing" as const,
    canonicalIngredientId: input.selectedCanonicalIngredientId,
    attributes: input.attributes,
  };
}

async function runRecipeExtraction(formData: FormData, rerun: boolean): Promise<ActionState> {
  const recipeId = String(formData.get("recipeId") ?? "").trim();

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  const pinId = await getRecipeHouseholdPinId(recipeId);

  if (!pinId) {
    return { status: "error", message: `Recipe ${recipeId} was not found.` };
  }

  try {
    const context = await requireHouseholdContext();
    const result = await extractRecipes({ householdId: context.householdId, recipeId, rerun });
    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: `Processed recipe ${recipeId}. Extracted ${result.extracted}, review ${result.reviewNeeded}, failed ${result.failed}.`,
    };
  } catch (error) {
    return toErrorState(error, `Unable to process recipe ${recipeId}.`);
  }
}

function parseRatingValue(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < 0.5 || parsed > 5) {
    return null;
  }

  return Math.round(parsed * 2) === parsed * 2 ? parsed : null;
}

function isValidReviewDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function canManageRecipeReview(
  context: Awaited<ReturnType<typeof requireHouseholdContext>>,
  reviewedByClerkUserId: string | null,
) {
  return context.role === "owner" || reviewedByClerkUserId === context.clerkUserId;
}

function isAiProvider(value: string): value is AiProvider {
  return value === "openai" || value === "anthropic" || value === "google" || value === "openrouter";
}
