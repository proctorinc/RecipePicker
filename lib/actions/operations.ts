"use server";

import crypto from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";

import {
  ADMIN_ROLE_OVERRIDE_COOKIE,
  canConfigureAi,
  getCurrentUserAccess,
  normalizeRoleOverride,
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
  householdRecipeEvents,
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
import { logAudit, runBackgroundJob, withActionLogging } from "@/lib/server/logger";
import {
  disconnectPinterestConnection,
  setPinterestConnectionAutoSyncEnabled,
} from "@/lib/server/pinterest";
import {
  cancelRecipeParseJob,
  createRecipeParseJob,
  resolveRecipeParseJobWorkerOrigin,
  resumeRecipeParseJob,
  scheduleRecipeParseJobWorker,
} from "@/lib/server/recipe-parse-jobs";
import { getRecipeHouseholdPinId } from "@/lib/server/queries";
import { extractRecipes } from "@/lib/server/extract";
import { revalidateAll, recipeScopedPaths, toErrorState, toOptionalString } from "@/lib/actions/helpers";
import { getTodayDayString, isValidDayString } from "@/lib/utils";
import type { ActionState } from "@/lib/actions/types";
import type { IngredientReviewSuggestionView, RecipeExtractionFeedbackCategory } from "@/types/view-models";

type DatabaseHandle = Awaited<ReturnType<typeof openDatabase>>["db"];

export const extractRecipeAction = withActionLogging(
  "action.extract_recipe",
  async (_: ActionState, formData: FormData): Promise<ActionState> =>
    runRecipeExtraction(formData, false),
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
      },
    }),
  },
);

export const rerunRecipeAction = withActionLogging(
  "action.rerun_recipe",
  async (_: ActionState, formData: FormData): Promise<ActionState> =>
    runRecipeExtraction(formData, true),
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
      },
    }),
  },
);

export const rerunRecipesAction = withActionLogging(
  "action.rerun_recipes",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
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

  try {
    const context = await requireHouseholdContext();
    const result = await createRecipeParseJob({
      householdId: context.householdId,
      requestedByClerkUserId: context.clerkUserId,
      recipeIds,
      rerun: true,
      mode: "bulk_rerun_selection",
    });

    if (!result.ok) {
      return { status: "error", message: result.message };
    }

    after(async () => {
      const origin = resolveRecipeParseJobWorkerOrigin({
        appUrl: process.env.APP_URL,
      });

      await runBackgroundJob({
        name: "background.recipe_parse_job",
        target: {
          householdId: context.householdId,
          jobId: result.jobId,
        },
        fn: async () =>
          scheduleRecipeParseJobWorker({
            jobId: result.jobId,
            workerToken: result.workerToken,
            origin,
          }),
      });
    });

    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: `Started a background parse job for ${result.totalRecipes} recipes.`,
    };
  } catch (error) {
    return toErrorState(error, "Unable to start the recipe parse job.");
  }
},
  {
    getStartData: (_state, formData) => ({
      result: {
        recipeCount: parseJsonStringArrayCount(formData.get("recipeIds")),
      },
    }),
  },
);

export const cancelRecipeParseJobAction = withActionLogging(
  "action.cancel_recipe_parse_job",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const jobId = String(formData.get("jobId") ?? "").trim();

    if (!jobId) {
      return { status: "error", message: "Job ID is required." };
    }

    try {
      const context = await requireHouseholdContext();
      const result = await cancelRecipeParseJob({
        householdId: context.householdId,
        jobId,
      });

      if (!result.ok) {
        return { status: "error", message: result.message };
      }

      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: result.message,
      };
    } catch (error) {
      return toErrorState(error, "Unable to cancel this parse job.");
    }
  },
  {
    getStartData: (_state, formData) => ({
      target: {
        jobId: String(formData.get("jobId") ?? "").trim() || null,
      },
    }),
  },
);

export const resumeRecipeParseJobAction = withActionLogging(
  "action.resume_recipe_parse_job",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const jobId = String(formData.get("jobId") ?? "").trim();

    if (!jobId) {
      return { status: "error", message: "Job ID is required." };
    }

    try {
      const context = await requireHouseholdContext();
      const result = await resumeRecipeParseJob({
        householdId: context.householdId,
        jobId,
      });

      if (!result.ok) {
        return { status: "error", message: result.message };
      }

      after(async () => {
        const origin = resolveRecipeParseJobWorkerOrigin({
          appUrl: process.env.APP_URL,
        });

        await runBackgroundJob({
          name: "background.recipe_parse_job",
          target: {
            householdId: context.householdId,
            jobId,
          },
          fn: async () =>
            scheduleRecipeParseJobWorker({
              jobId,
              workerToken: result.workerToken,
              origin,
            }),
        });
      });

      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: result.message,
      };
    } catch (error) {
      return toErrorState(error, "Unable to resume this parse job.");
    }
  },
  {
    getStartData: (_state, formData) => ({
      target: {
        jobId: String(formData.get("jobId") ?? "").trim() || null,
      },
    }),
  },
);

export const createInviteAction = withActionLogging(
  "action.create_invite",
  async (_: ActionState, _formData: FormData): Promise<ActionState> => {
  try {
    const context = await requireHouseholdRole("owner");
    const { db, sqlite } = await openDatabase();
    const token = crypto.randomUUID();
    const now = new Date();

    try {
      await db.insert(householdInvites)
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
      await sqlite.close();
    }

    logAudit("household.invite_created", {
      target: {
        householdId: context.householdId,
      },
    });

    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: "Created a fresh household invite link.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to create an invite.");
  }
},
);

export const disconnectPinterestAction = withActionLogging(
  "action.disconnect_pinterest",
  async (_: ActionState, _formData: FormData): Promise<ActionState> => {
  try {
    const context = await requireHouseholdRole("owner");
    await disconnectPinterestConnection(context.householdId);
    logAudit("pinterest.connection_disconnected", {
      target: {
        householdId: context.householdId,
      },
    });
    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: "Disconnected Pinterest for this household.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to disconnect Pinterest.");
  }
},
);

export const saveAiConnectionAction = withActionLogging(
  "action.save_ai_connection",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const rawProvider = String(formData.get("provider") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const newApiKey = String(formData.get("apiKey") ?? "").trim();

  try {
    const appAccess = await getCurrentUserAccess();
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

    logAudit("ai.connection_saved", {
      target: {
        householdId: context.householdId,
      },
      result: {
        provider: rawProvider,
        model,
        testStatus: testResult.status,
      },
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
},
  {
    getStartData: (_state, formData) => ({
      result: {
        provider: String(formData.get("provider") ?? "").trim() || null,
        model: String(formData.get("model") ?? "").trim() || null,
        apiKeyProvided: Boolean(String(formData.get("apiKey") ?? "").trim()),
      },
    }),
  },
);

export const disconnectAiConnectionAction = withActionLogging(
  "action.disconnect_ai_connection",
  async (_: ActionState, _formData: FormData): Promise<ActionState> => {
  try {
    const appAccess = await getCurrentUserAccess();
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
    logAudit("ai.connection_disconnected", {
      target: {
        householdId: context.householdId,
      },
    });
    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: "Disconnected the household AI connection.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to disconnect the AI connection.");
  }
},
);

export const updateSubscriptionTierAction = withActionLogging(
  "action.update_subscription_tier",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
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
    logAudit("admin.subscription_tier_updated", {
      result: {
        subscriptionTier: requestedTier,
      },
    });
    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: `Your subscription tier is now ${requestedTier}.`,
    };
  } catch (error) {
    return toErrorState(error, "Unable to update the subscription tier.");
  }
},
  {
    getStartData: (_state, formData) => ({
      result: {
        subscriptionTier: String(formData.get("subscriptionTier") ?? "").trim() || null,
      },
    }),
  },
);

export const updateRoleOverrideAction = withActionLogging(
  "action.update_role_override",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const requestedRole = normalizeRoleOverride(formData.get("appRole"));
  const rawRole = String(formData.get("appRole") ?? "").trim();

  if (rawRole !== "admin" && rawRole !== "owner" && rawRole !== "user") {
    return { status: "error", message: "Choose user, owner, or admin for the UI preview role." };
  }

  try {
    await requireAdminAccess();

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_ROLE_OVERRIDE_COOKIE, requestedRole ?? "admin", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    logAudit("admin.role_override_updated", {
      result: {
        appRole: requestedRole ?? "admin",
      },
    });

    return {
      status: "success",
      message: `Frontend role preview is now ${requestedRole}.`,
    };
  } catch (error) {
    return toErrorState(error, "Unable to update the frontend role preview.");
  }
},
  {
    getStartData: (_state, formData) => ({
      result: {
        appRole: String(formData.get("appRole") ?? "").trim() || null,
      },
    }),
  },
);

export const setPinterestAutoSyncEnabledAction = withActionLogging(
  "action.set_pinterest_auto_sync_enabled",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const enabled = String(formData.get("enabled") ?? "").trim() === "true";

    try {
      await requireAdminAccess();
      const household = await requireHouseholdContext();

      await setPinterestConnectionAutoSyncEnabled({
        householdId: household.householdId,
        enabled,
      });

      logAudit("admin.pinterest_auto_sync_updated", {
        target: {
          householdId: household.householdId,
        },
        result: {
          enabled,
        },
      });

      revalidateAll(recipeScopedPaths());
      return {
        status: "success",
        message: enabled
          ? "Pinterest auto-sync is on."
          : "Pinterest auto-sync is off.",
      };
    } catch (error) {
      return toErrorState(error, "Unable to update Pinterest auto-sync.");
    }
  },
  {
    getStartData: (_state, formData) => ({
      result: {
        enabled: String(formData.get("enabled") ?? "").trim() === "true",
      },
    }),
  },
);

export const joinHouseholdInviteAction = withActionLogging(
  "action.join_household_invite",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const inviteToken = String(formData.get("inviteToken") ?? "").trim();

  if (!inviteToken) {
    return { status: "error", message: "Invite token is required." };
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      return { status: "error", message: "You need to sign in before joining a household." };
    }

    const { db, sqlite } = await openDatabase();

    try {
      const invite = await db.query.householdInvites.findFirst({
        where: (table, { eq }) => eq(table.inviteToken, inviteToken),
      });

      if (!invite) {
        return { status: "error", message: "Invite not found." };
      }

      if (invite.consumedAt) {
        return { status: "error", message: "Invite has already been used." };
      }

      if (new Date(invite.expiresAt).getTime() < Date.now()) {
        return { status: "error", message: "Invite has expired." };
      }

      await db.delete(householdMembers).where(eq(householdMembers.clerkUserId, userId)).run();
      await addMemberToHousehold(invite.householdId, userId, "member");

      await db.update(householdInvites)
        .set({
          consumedAt: new Date().toISOString(),
          consumedByClerkUserId: userId,
        })
        .where(eq(householdInvites.inviteToken, inviteToken))
        .run();

      logAudit("household.invite_joined", {
        target: {
          householdId: invite.householdId,
        },
      });
    } finally {
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths());
    return {
      status: "success",
      message: "Joined the shared household.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to join this household.");
  }
},
);

export const reviewIngredientAction = withActionLogging(
  "action.review_ingredient",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
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
    const { db, sqlite } = await openDatabase();

    try {
      const ingredient = await db.query.householdRecipeIngredients.findFirst({
        where: (table, { and, eq }) =>
          and(eq(table.householdId, context.householdId), eq(table.ingredientId, ingredientId), eq(table.recipeId, recipeId)),
      });

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
          ? await createCanonicalIngredient(db, context.householdId, resolvedReview.displayName, {
              parentCanonicalIngredientId: resolvedReview.parentCanonicalIngredientId,
              ingredientKind: resolvedReview.ingredientKind,
            })
          : { canonicalIngredientId: resolvedReview.canonicalIngredientId };

      await upsertReviewedIngredientMapping({
        db,
        householdId: context.householdId,
        normalizedPhrase: normalizedPhrase || ingredient.normalizedIngredientPhrase || ingredient.originalText,
        canonicalIngredientId: canonicalIngredient.canonicalIngredientId,
        aliasText: aliasText || ingredient.originalText,
        attributes: resolvedReview.attributes,
        savePhraseMapping,
        saveAlias,
      });

      await db.update(householdRecipeIngredients)
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
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId).concat("/settings/ingredients"));
    return {
      status: "success",
      message: "Ingredient mapping confirmed and saved for future imports.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save the ingredient review.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        ingredientId: String(formData.get("ingredientId") ?? "").trim() || null,
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
      },
      result: {
        reviewMode: String(formData.get("reviewMode") ?? "").trim() || null,
        savePhraseMapping: toChecked(formData.get("savePhraseMapping")),
        saveAlias: toChecked(formData.get("saveAlias")),
      },
    }),
  },
);

export const saveRecipeContentAction = withActionLogging(
  "action.save_recipe_content",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const ingredients = parseRecipeContentItems(formData.get("ingredientsJson"), isRecipeIngredientInput);
  const steps = parseRecipeContentItems(formData.get("stepsJson"), isRecipeStepInput);

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = await openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = await db.query.householdRecipes.findFirst({
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
      });

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
        await db.update(householdRecipeIngredients)
          .set({
            originalText: ingredient.originalText.trim(),
            notes: ingredient.notes?.trim() || null,
          })
          .where(and(eq(householdRecipeIngredients.recipeId, recipeId), eq(householdRecipeIngredients.ingredientId, ingredient.id)))
          .run();
      }

      for (const step of steps) {
        await db.update(householdRecipeSteps)
          .set({
            section: step.section?.trim() || null,
            text: step.text.trim(),
          })
          .where(and(eq(householdRecipeSteps.recipeId, recipeId), eq(householdRecipeSteps.stepId, step.id)))
          .run();
      }

      await db.update(householdRecipes)
        .set({
          updatedAt: now,
        })
        .where(and(eq(householdRecipes.recipeId, recipeId), eq(householdRecipes.householdId, context.householdId)))
        .run();
    } finally {
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Saved the recipe content updates.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save the recipe content.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
      },
      result: {
        ingredientCount: parseRecipeContentItems(formData.get("ingredientsJson"), isRecipeIngredientInput).length,
        stepCount: parseRecipeContentItems(formData.get("stepsJson"), isRecipeStepInput).length,
      },
    }),
  },
);

export const saveRecipeMetadataAction = withActionLogging(
  "action.save_recipe_metadata",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  if (!title) {
    return { status: "error", message: "Title cannot be empty." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = await openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = await db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        columns: {
          recipeId: true,
        },
      });

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      await db.update(householdRecipes)
        .set({
          title,
          description: description || null,
          titleOverridden: true,
          descriptionOverridden: true,
          updatedAt: now,
        })
        .where(and(eq(householdRecipes.recipeId, recipeId), eq(householdRecipes.householdId, context.householdId)))
        .run();
    } finally {
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Saved the recipe details.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save the recipe details.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
      },
      result: {
        hasTitle: String(formData.get("title") ?? "").trim().length > 0,
        hasDescription: String(formData.get("description") ?? "").trim().length > 0,
      },
    }),
  },
);

export const saveRecipeFeedbackAction = withActionLogging(
  "action.save_recipe_feedback",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
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
    const { db, sqlite } = await openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = await db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        columns: {
          recipeId: true,
        },
        with: {
          feedback: true,
        },
      });

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      if (recipe.feedback) {
        await db.update(householdRecipeFeedback)
          .set({
            summary,
            note,
            updatedByClerkUserId: context.clerkUserId,
            updatedAt: now,
          })
          .where(eq(householdRecipeFeedback.feedbackId, recipe.feedback.feedbackId))
          .run();
      } else {
        await db.insert(householdRecipeFeedback)
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
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Saved reusable recipe guidance.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save recipe guidance.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
      },
      result: {
        hasSummary: Boolean(toOptionalString(formData.get("summary"))),
        hasNote: Boolean(toOptionalString(formData.get("note"))),
      },
    }),
  },
);

export const saveExtractionFeedbackAction = withActionLogging(
  "action.save_extraction_feedback",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
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
    const { db, sqlite } = await openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = await db.query.householdRecipes.findFirst({
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
      });

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      if (extractionId) {
        const allowedExtractionIds = new Set(recipe.pin.recipeExtractions.map((extraction) => extraction.extractionId));
        if (!allowedExtractionIds.has(extractionId)) {
          return { status: "error", message: "That run is no longer available for feedback." };
        }
      }

      await db.insert(householdRecipeExtractionFeedback)
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
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Saved run feedback for future parsing reviews.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save run feedback.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
        extractionId: toOptionalString(formData.get("extractionId")),
      },
      result: {
        category: String(formData.get("category") ?? "").trim() || null,
      },
    }),
  },
);

export const createRecipeEventAction = withActionLogging(
  "action.create_recipe_event",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  if (!isValidDayString(date)) {
    return { status: "error", message: "Choose a valid date for this meal." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = await openDatabase();
    const now = new Date().toISOString();
    let eventId: string | null = null;

    try {
      const recipe = await db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        columns: {
          recipeId: true,
          pinId: true,
        },
      });

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      const existingEvent = await db.query.householdRecipeEvents.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.householdId, context.householdId),
            eq(table.recipeId, recipe.recipeId),
            eq(table.date, date),
          ),
        columns: {
          eventId: true,
        },
      });

      if (existingEvent) {
        return {
          status: "error",
          message: "This recipe is already on that day.",
        };
      }

      eventId = await insertRecipeEvent(db, {
        householdId: context.householdId,
        recipeId: recipe.recipeId,
        date,
        clerkUserId: context.clerkUserId,
        now,
      });
    } finally {
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: date > getTodayDayString() ? "Planned recipe added to the calendar." : "Meal added to history.",
      data: {
        eventId,
      },
    };
  } catch (error) {
    return toErrorState(error, "Unable to save this recipe event.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
      },
      result: {
        date: String(formData.get("date") ?? "").trim() || null,
      },
    }),
  },
);

export const createRecipeEventsAction = withActionLogging(
  "action.create_recipe_events",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const recipeId = String(formData.get("recipeId") ?? "").trim();
    const rawDates = String(formData.get("dates") ?? "").trim();

    if (!recipeId) {
      return { status: "error", message: "Recipe ID is required." };
    }

    let dates: string[] = [];

    try {
      const parsed = JSON.parse(rawDates);
      dates = Array.isArray(parsed)
        ? parsed.filter(
            (value): value is string =>
              typeof value === "string" && isValidDayString(value),
          )
        : [];
    } catch {
      return { status: "error", message: "Choose valid dates for this meal." };
    }

    dates = Array.from(new Set(dates)).sort((left, right) =>
      left.localeCompare(right),
    );
    let datesToCreate: string[] = [];

    if (dates.length === 0) {
      return { status: "error", message: "Choose at least one day." };
    }

    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();
      const now = new Date().toISOString();
      let firstReviewEventId: string | null = null;
      let firstReviewDate: string | null = null;

      try {
        const recipe = await db.query.householdRecipes.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.recipeId, recipeId),
              eq(table.householdId, context.householdId),
            ),
          columns: {
            recipeId: true,
            pinId: true,
          },
        });

        if (!recipe) {
          return { status: "error", message: "Recipe was not found." };
        }

        const existingEvents = await db.query.householdRecipeEvents.findMany({
          where: (table, { and, eq, inArray }) =>
            and(
              eq(table.householdId, context.householdId),
              eq(table.recipeId, recipe.recipeId),
              inArray(table.date, dates),
            ),
          columns: {
            date: true,
          },
        });
        const existingDates = new Set(existingEvents.map((event) => event.date));
        datesToCreate = dates.filter((date) => !existingDates.has(date));

        if (datesToCreate.length === 0) {
          return {
            status: "error",
            message:
              dates.length === 1
                ? "This recipe is already on that day."
                : "This recipe is already on all of those days.",
          };
        }

        for (const date of datesToCreate) {
          const eventId = await insertRecipeEvent(db, {
            householdId: context.householdId,
            recipeId: recipe.recipeId,
            date,
            clerkUserId: context.clerkUserId,
            now,
          });

          if (!firstReviewEventId && date <= getTodayDayString()) {
            firstReviewEventId = eventId;
            firstReviewDate = date;
          }
        }
      } finally {
        await sqlite.close();
      }

      revalidateAll(recipeScopedPaths(undefined, recipeId));

      return {
        status: "success",
        message:
          datesToCreate.length === 1
            ? datesToCreate[0]! > getTodayDayString()
              ? "Planned recipe added to the calendar."
              : "Meal added to history."
            : `Recipe added to ${datesToCreate.length} days.`,
        data: {
          firstEventId: firstReviewEventId,
          firstEventDate: firstReviewDate,
          dayCount: datesToCreate.length,
        },
      };
    } catch (error) {
      return toErrorState(error, "Unable to save these recipe events.");
    }
  },
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
      },
      result: {
        dayCount: parseJsonStringArrayCount(formData.get("dates")),
      },
    }),
  },
);

export const createRecipeReviewAction = withActionLogging(
  "action.create_recipe_review",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim() || null;
  const ratingValue = parseRatingValue(formData.get("ratingValue"));
  const eatenOn = toOptionalString(formData.get("eatenOn"));
  const note = toOptionalString(formData.get("note"));

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  if (!ratingValue) {
    return { status: "error", message: "Choose a rating between 0.5 and 5 stars." };
  }

  if (eatenOn && !isValidDayString(eatenOn)) {
    return { status: "error", message: "Choose the date you ate this meal." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = await openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = await db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        columns: {
          recipeId: true,
          pinId: true,
        },
      });

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      const linkedEvent = eventId
        ? await db.query.householdRecipeEvents.findFirst({
          where: (table, { and, eq }) => and(eq(table.eventId, eventId), eq(table.householdId, context.householdId)),
        })
        : null;

      if (eventId && !linkedEvent) {
        return { status: "error", message: "Recipe event was not found." };
      }

      if (linkedEvent && linkedEvent.recipeId !== recipe.recipeId) {
        return { status: "error", message: "Recipe event does not match this recipe." };
      }

      if (linkedEvent) {
        const existingEventReview = await db.query.householdRecipeReviews.findFirst({
          where: (table, { and, eq }) => and(eq(table.eventId, linkedEvent.eventId), eq(table.householdId, context.householdId)),
          columns: {
            reviewId: true,
          },
        });

        if (existingEventReview) {
          return { status: "error", message: "This meal already has a review." };
        }
      }

      const eventDate = linkedEvent?.date ?? eatenOn;

      if (eventDate && eventDate > getTodayDayString()) {
        return { status: "error", message: "Planned recipes cannot be reviewed yet." };
      }

      let resolvedEventId = linkedEvent?.eventId ?? null;

      if (!resolvedEventId && eatenOn) {
        resolvedEventId = await insertRecipeEvent(db, {
          householdId: context.householdId,
          recipeId: recipe.recipeId,
          date: eatenOn,
          clerkUserId: context.clerkUserId,
          now,
        });
      }

      await db.insert(householdRecipeReviews)
        .values({
          householdId: context.householdId,
          recipeId: recipe.recipeId,
          eventId: resolvedEventId,
          reviewedByClerkUserId: context.clerkUserId,
          ratingValue,
          eatenOn: resolvedEventId ? null : eatenOn,
          note,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } finally {
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: "Review saved to meal history.",
    };
  } catch (error) {
    return toErrorState(error, "Unable to save this review.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
        eventId: String(formData.get("eventId") ?? "").trim() || null,
      },
      result: {
        ratingValue: parseRatingValue(formData.get("ratingValue")),
        hasEatenOn: Boolean(toOptionalString(formData.get("eatenOn"))),
      },
    }),
  },
);

export const updateRecipeReviewAction = withActionLogging(
  "action.update_recipe_review",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim() || null;
  const ratingValue = parseRatingValue(formData.get("ratingValue"));
  const eatenOn = toOptionalString(formData.get("eatenOn"));
  const note = toOptionalString(formData.get("note"));

  if (!reviewId) {
    return { status: "error", message: "Review ID is required." };
  }

  if (!ratingValue) {
    return { status: "error", message: "Choose a rating between 0.5 and 5 stars." };
  }

  if (eatenOn && !isValidDayString(eatenOn)) {
    return { status: "error", message: "Choose the date you ate this meal." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = await openDatabase();

    try {
      const review = await db.query.householdRecipeReviews.findFirst({
        where: (table, { and, eq }) => and(eq(table.reviewId, reviewId), eq(table.householdId, context.householdId)),
        with: {
          event: true,
        },
      });

      if (!review) {
        return { status: "error", message: "Review was not found." };
      }

      if (!canManageRecipeReview(context, review.reviewedByClerkUserId)) {
        return { status: "error", message: "You do not have permission to edit this review." };
      }

      const effectiveEventId = eventId ?? review.eventId ?? null;
      const linkedEvent = effectiveEventId
        ? await db.query.householdRecipeEvents.findFirst({
          where: (table, { and, eq }) => and(eq(table.eventId, effectiveEventId), eq(table.householdId, context.householdId)),
        })
        : null;

      if (effectiveEventId && !linkedEvent) {
        return { status: "error", message: "Recipe event was not found." };
      }

      const eventDate = linkedEvent?.date ?? eatenOn ?? review.eatenOn;

      if (eventDate && eventDate > getTodayDayString()) {
        return { status: "error", message: "Planned recipes cannot be reviewed yet." };
      }

      let nextEventId = linkedEvent?.eventId ?? review.eventId ?? null;

      if (!nextEventId && eatenOn) {
        nextEventId = await insertRecipeEvent(db, {
          householdId: context.householdId,
          recipeId: review.recipeId,
          date: eatenOn,
          clerkUserId: context.clerkUserId,
          now: new Date().toISOString(),
        });
      }

      await db.update(householdRecipeReviews)
        .set({
          eventId: nextEventId,
          ratingValue,
          eatenOn: nextEventId ? null : eatenOn,
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
      await sqlite.close();
    }
  } catch (error) {
    return toErrorState(error, "Unable to update this review.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        reviewId: String(formData.get("reviewId") ?? "").trim() || null,
        eventId: String(formData.get("eventId") ?? "").trim() || null,
      },
      result: {
        ratingValue: parseRatingValue(formData.get("ratingValue")),
        hasEatenOn: Boolean(toOptionalString(formData.get("eatenOn"))),
      },
    }),
  },
);

export const deleteRecipeReviewAction = withActionLogging(
  "action.delete_recipe_review",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const reviewId = String(formData.get("reviewId") ?? "").trim();

  if (!reviewId) {
    return { status: "error", message: "Review ID is required." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = await openDatabase();

    try {
      const review = await db.query.householdRecipeReviews.findFirst({
        where: (table, { and, eq }) => and(eq(table.reviewId, reviewId), eq(table.householdId, context.householdId)),
      });

      if (!review) {
        return { status: "error", message: "Review was not found." };
      }

      if (!canManageRecipeReview(context, review.reviewedByClerkUserId)) {
        return { status: "error", message: "You do not have permission to delete this review." };
      }

      await db.delete(householdRecipeReviews).where(eq(householdRecipeReviews.reviewId, reviewId)).run();

      revalidateAll(recipeScopedPaths(undefined, review.recipeId));
      return {
        status: "success",
        message: "Review deleted.",
      };
    } finally {
      await sqlite.close();
    }
  } catch (error) {
    return toErrorState(error, "Unable to delete this review.");
  }
},
  {
    getStartData: (_state, formData) => ({
      target: {
        reviewId: String(formData.get("reviewId") ?? "").trim() || null,
      },
    }),
  },
);

export const deleteRecipeEventAction = withActionLogging(
  "action.delete_recipe_event",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const eventId = String(formData.get("eventId") ?? "").trim();

    if (!eventId) {
      return { status: "error", message: "Event ID is required." };
    }

    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();

      try {
        const event = await db.query.householdRecipeEvents.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.eventId, eventId),
              eq(table.householdId, context.householdId),
            ),
          with: {
            review: true,
          },
        });

        if (!event) {
          return { status: "error", message: "Meal history entry was not found." };
        }

        if (!canManageRecipeEvent(context, event.createdByClerkUserId, event.review)) {
          return {
            status: "error",
            message: "You do not have permission to remove this meal history entry.",
          };
        }

        if (event.review) {
          await db.delete(householdRecipeReviews)
            .where(eq(householdRecipeReviews.reviewId, event.review.reviewId))
            .run();
        }

        await db.delete(householdRecipeEvents)
          .where(eq(householdRecipeEvents.eventId, eventId))
          .run();

        revalidateAll(recipeScopedPaths(undefined, event.recipeId));
        return {
          status: "success",
          message: "Meal history entry removed.",
        };
      } finally {
        await sqlite.close();
      }
    } catch (error) {
      return toErrorState(error, "Unable to remove this meal history entry.");
    }
  },
  {
    getStartData: (_state, formData) => ({
      target: {
        eventId: String(formData.get("eventId") ?? "").trim() || null,
      },
    }),
  },
);

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

function parseJsonStringArrayCount(value: FormDataEntryValue | null) {
  if (!value) {
    return 0;
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).length
      : 0;
  } catch {
    return 0;
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

async function insertRecipeEvent(
  db: DatabaseHandle,
  input: {
    householdId: string;
    recipeId: string;
    date: string;
    clerkUserId: string;
    now: string;
  },
) {
  const result = await db.insert(householdRecipeEvents)
    .values({
      householdId: input.householdId,
      recipeId: input.recipeId,
      date: input.date,
      createdByClerkUserId: input.clerkUserId,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();

  return result[0]?.eventId ?? null;
}

function canManageRecipeReview(
  context: Awaited<ReturnType<typeof requireHouseholdContext>>,
  reviewedByClerkUserId: string | null,
) {
  return context.role === "owner" || reviewedByClerkUserId === context.clerkUserId;
}

function canManageRecipeEvent(
  context: Awaited<ReturnType<typeof requireHouseholdContext>>,
  createdByClerkUserId: string | null,
  review: {
    reviewedByClerkUserId: string | null;
  } | null,
) {
  if (context.role === "owner") {
    return true;
  }

  if (!createdByClerkUserId || createdByClerkUserId !== context.clerkUserId) {
    return false;
  }

  if (!review) {
    return true;
  }

  return review.reviewedByClerkUserId === context.clerkUserId;
}

function isAiProvider(value: string): value is AiProvider {
  return value === "openai" || value === "anthropic" || value === "google" || value === "openrouter";
}
