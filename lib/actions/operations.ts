"use server";

import crypto from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { and, desc, eq, inArray } from "drizzle-orm";

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
  householdRecipeIngredientAlternatives,
  householdAlwaysHaveIngredients,
  householdCanonicalIngredients,
  householdIngredientAliases,
  householdIngredientPhraseMappings,
  householdRecipeReviews,
  householdRecipeSteps,
  householdRecipeVersions,
  householdRecipes,
  householdShoppingCarts,
  householdShoppingCartItemStates,
} from "@/lib/server/db";
import {
  createCanonicalIngredient,
  normalizeIngredientKey,
  normalizeAttributes,
  upsertReviewedIngredientMapping,
  type IngredientKind,
} from "@/lib/server/ingredient-normalization";
import {
  disconnectHouseholdAiConnection,
  getAiModelCatalog,
  getStoredHouseholdAiConfig,
  getStoredHouseholdAiKey,
  testHouseholdAiConnection,
  type AiProvider,
  upsertHouseholdAiConnection,
} from "@/lib/server/ai-provider";
import { getIngredientAiParses } from "@/lib/server/ingredient-ai";
import { logAudit, withActionLogging } from "@/lib/server/logger";
import { resolveRecipeImageSources } from "@/lib/recipe-image-sources";
import { formatIngredientOriginalText, parseAmountText } from "@/lib/ingredient-parsing";
import {
  disconnectPinterestConnection,
  setPinterestConnectionAutoSyncEnabled,
} from "@/lib/server/pinterest";
import {
  cancelRecipeParseJob,
  createRecipeParseJob,
  markRecipeParseJobQueueingFailure,
  resumeRecipeParseJob,
} from "@/lib/server/recipe-parse-jobs";
import { sendRecipeParseJobRequestedEvent } from "@/src/inngest/events";
import { getRecipeHouseholdPinId } from "@/lib/server/queries";
import { extractRecipes } from "@/lib/server/extract";
import { derivePinStatus } from "@/lib/server/status";
import { createCustomRecipe, publishPersonalRecipe } from "@/lib/server/custom-recipe";
import { revalidateAll, recipeScopedPaths, toErrorState, toOptionalString } from "@/lib/actions/helpers";
import { expandDayRange, getTodayDayString, isValidDayString } from "@/lib/utils";
import type { ActionState } from "@/lib/actions/types";
import type { IngredientReviewSuggestionView, RecipeExtractionFeedbackCategory } from "@/types/view-models";

type DatabaseHandle = Awaited<ReturnType<typeof openDatabase>>["db"];

export const createCustomRecipeAction = withActionLogging(
  "action.create_custom_recipe",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const title = String(formData.get("title") ?? "").trim();
    const boardId = String(formData.get("boardId") ?? "").trim();
    const sourceUrl = toOptionalString(formData.get("sourceUrl"));
    const ingredients = parseCustomRecipeLines(formData.get("ingredientsJson"));
    const steps = parseCustomRecipeLines(formData.get("stepsJson"));
    const image = formData.get("image");
    const imageFile = image instanceof File && image.size > 0 ? image : null;
    const imageUrl = toOptionalString(formData.get("imageUrl"));

    if (!title || ingredients.length === 0 || steps.length === 0) {
      return { status: "error", message: "Add a title, ingredient, and instruction." };
    }
    if (!imageFile && !imageUrl) {
      return { status: "error", message: "Add a recipe image before publishing." };
    }
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          throw new Error("unsupported protocol");
        }
      } catch {
        return { status: "error", message: "Enter a valid recipe source URL." };
      }
    }

    try {
      const context = await requireHouseholdContext();
      const result = await createCustomRecipe({
        householdId: context.householdId,
        boardId: boardId || null,
        title,
        description: toOptionalString(formData.get("description")),
        sourceUrl,
        yieldText: toOptionalString(formData.get("yieldText")),
        prepTime: toOptionalString(formData.get("prepTime")),
        cookTime: toOptionalString(formData.get("cookTime")),
        totalTime: toOptionalString(formData.get("totalTime")),
        ingredients,
        steps,
        imageFile,
        imageUrl,
      });
      revalidateAll(recipeScopedPaths(undefined, result.recipeId));
      return {
        status: "success",
        message: boardId ? "Recipe published to Pinterest and added to your library." : "Personal recipe saved to your library.",
        data: { recipeId: result.recipeId },
      };
    } catch (error) {
      return toErrorState(error, "Unable to create and publish this recipe.");
    }
  },
  {
    getStartData: (_state, formData) => ({
      result: { title: String(formData.get("title") ?? "").trim() || null },
    }),
  },
);

export const publishPersonalRecipeAction = withActionLogging(
  "action.publish_personal_recipe",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const recipeId = String(formData.get("recipeId") ?? "").trim();
    const boardId = String(formData.get("boardId") ?? "").trim();
    if (!recipeId || !boardId) return { status: "error", message: "Choose a synced Pinterest board." };
    try {
      const context = await requireHouseholdContext();
      await publishPersonalRecipe({ householdId: context.householdId, recipeId, boardId });
      revalidateAll(recipeScopedPaths(undefined, recipeId));
      return { status: "success", message: "Recipe published to Pinterest." };
    } catch (error) {
      return toErrorState(error, "Unable to publish this recipe.");
    }
  },
);

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

export const toggleRecipeFlagAction = withActionLogging(
  "action.toggle_recipe_flag",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const recipeId = String(formData.get("recipeId") ?? "").trim();

    if (!recipeId) {
      return { status: "error", message: "Recipe ID is required." };
    }

    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();

      try {
        const recipe = await db.query.householdRecipes.findFirst({
          where: (table, { and, eq }) => and(
            eq(table.recipeId, recipeId),
            eq(table.householdId, context.householdId),
          ),
          with: {
            pin: {
              with: {
                recipeExtractions: {
                  orderBy: (table, { desc }) => [desc(table.createdAt)],
                  limit: 1,
                },
              },
            },
            recipeInstructions: {
              with: {
                ingredients: {
                  columns: { normalizationStatus: true },
                },
              },
            },
          },
        });

        if (!recipe) {
          return { status: "error", message: "Recipe not found." };
        }

        const latestExtraction = recipe.pin.recipeExtractions[0];
        const status = derivePinStatus({
          hasRecipe: Boolean(recipe.recipeInstructions),
          latestExtractionStatus: latestExtraction?.status,
          latestExtractionLowConfidence: latestExtraction?.lowConfidence,
          ingredientReviewCount: recipe.recipeInstructions?.ingredients.filter(
            (ingredient) => ingredient.normalizationStatus === "needs_review",
          ).length ?? 0,
        });

        if (status === "recipe_ready") {
          return { status: "error", message: "Ready recipes cannot be flagged." };
        }

        const isFlagged = !recipe.isFlagged;
        await db.update(householdRecipes)
          .set({ isFlagged })
          .where(and(
            eq(householdRecipes.recipeId, recipeId),
            eq(householdRecipes.householdId, context.householdId),
          ))
          .run();

        revalidateAll(recipeScopedPaths(undefined, recipeId));
        return {
          status: "success",
          message: isFlagged ? "Recipe flagged for follow-up." : "Recipe flag removed.",
        };
      } finally {
        await sqlite.close();
      }
    } catch (error) {
      return toErrorState(error, "Unable to update this recipe flag.");
    }
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

    try {
      await sendRecipeParseJobRequestedEvent({
        jobId: result.jobId,
        householdId: context.householdId,
        trigger: "create",
      });
    } catch (error) {
      await markRecipeParseJobQueueingFailure({
        jobId: result.jobId,
        error,
      });
      throw error;
    }

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
    getResultData: (result, _state, formData) => ({
      result: {
        status: result.status,
      },
      recipeCount: parseJsonStringArrayCount(formData.get("recipeIds")),
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
    getResultData: (result, _state, formData) => ({
      result: {
        status: result.status,
      },
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

      try {
        await sendRecipeParseJobRequestedEvent({
          jobId,
          householdId: context.householdId,
          trigger: "resume",
        });
      } catch (error) {
        await markRecipeParseJobQueueingFailure({
          jobId,
          error,
        });
        throw error;
      }

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
    getResultData: (result, _state, formData) => ({
      result: {
        status: result.status,
      },
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

export const createShoppingCartAction = withActionLogging(
  "action.create_shopping_cart",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const first = String(formData.get("startDate") ?? "").trim();
    const second = String(formData.get("endDate") ?? "").trim();
    if (!isValidDayString(first) || !isValidDayString(second) || expandDayRange(first, second).length === 0) return { status: "error", message: "Choose a valid date range." };
    const [startDate, endDate] = first <= second ? [first, second] : [second, first];
    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();
      try {
        const now = new Date().toISOString();
        await sqlite.transaction(async (tx) => {
          await tx.update(householdShoppingCarts).set({ status: "archived", updatedAt: now }).where(and(eq(householdShoppingCarts.householdId, context.householdId), eq(householdShoppingCarts.status, "active"))).run();
          await tx.insert(householdShoppingCarts).values({ householdId: context.householdId, startDate, endDate, status: "active", createdAt: now, updatedAt: now }).run();
        });
      } finally { await sqlite.close(); }
      revalidateAll(["/shopping-cart", "/history"]);
      return { status: "success", message: "Shared shopping cart updated." };
    } catch (error) { return toErrorState(error, "Unable to create the shopping cart."); }
  },
);

export const restoreShoppingCartAction = withActionLogging(
  "action.restore_shopping_cart",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const cartId = String(formData.get("cartId") ?? "").trim();
    if (!cartId) return { status: "error", message: "Choose a cart to restore." };
    try {
      const context = await requireHouseholdContext(); const { db, sqlite } = await openDatabase();
      try {
        const cart = await db.query.householdShoppingCarts.findFirst({ where: (table, { and, eq: equals }) => and(equals(table.cartId, cartId), equals(table.householdId, context.householdId), equals(table.status, "archived")), columns: { cartId: true } });
        if (!cart) return { status: "error", message: "That cart is no longer available." };
        const now = new Date().toISOString();
        await sqlite.transaction(async (tx) => {
          await tx.update(householdShoppingCarts).set({ status: "archived", updatedAt: now }).where(and(eq(householdShoppingCarts.householdId, context.householdId), eq(householdShoppingCarts.status, "active"))).run();
          await tx.update(householdShoppingCarts).set({ status: "active", updatedAt: now }).where(and(eq(householdShoppingCarts.cartId, cartId), eq(householdShoppingCarts.householdId, context.householdId))).run();
        });
      } finally { await sqlite.close(); }
      revalidateAll(["/shopping-cart", "/history"]); return { status: "success", message: "Previous cart restored." };
    } catch (error) { return toErrorState(error, "Unable to restore the cart."); }
  },
);

async function getOwnedActiveCart(cartId: string) {
  const context = await requireHouseholdContext(); const { db, sqlite } = await openDatabase();
  const cart = await db.query.householdShoppingCarts.findFirst({ where: (table, { and, eq: equals }) => and(equals(table.cartId, cartId), equals(table.householdId, context.householdId), equals(table.status, "active")) });
  return { context, db, sqlite, cart };
}

export const setShoppingCartItemCheckedAction = withActionLogging(
  "action.set_shopping_cart_item_checked",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const cartId = String(formData.get("cartId") ?? "").trim(); const itemId = String(formData.get("itemId") ?? "").trim(); const checked = String(formData.get("checked")) === "true";
    if (!cartId || !itemId) return { status: "error", message: "Cart item details are incomplete." };
    try { const { db, sqlite, cart } = await getOwnedActiveCart(cartId); try {
      if (!cart) return { status: "error", message: "This is not the active household cart." };
      const now = new Date().toISOString();
      await db.insert(householdShoppingCartItemStates).values({ cartId, itemId, checked, sortPosition: 0, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [householdShoppingCartItemStates.cartId, householdShoppingCartItemStates.itemId], set: { checked, updatedAt: now } }).run();
    } finally { await sqlite.close(); } revalidateAll(["/shopping-cart"]); return { status: "success", message: "Cart item updated." }; } catch (error) { return toErrorState(error, "Unable to update the cart item."); }
  },
);

export const reorderShoppingCartItemsAction = withActionLogging(
  "action.reorder_shopping_cart_items",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const cartId = String(formData.get("cartId") ?? "").trim();
    let itemIds: string[] = []; try { const parsed = JSON.parse(String(formData.get("itemIds") ?? "[]")); itemIds = Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0))] : []; } catch { /* invalid payload */ }
    if (!cartId || itemIds.length === 0) return { status: "error", message: "Cart ordering details are incomplete." };
    try { const { db, sqlite, cart } = await getOwnedActiveCart(cartId); try {
      if (!cart) return { status: "error", message: "This is not the active household cart." };
      const now = new Date().toISOString();
      for (const [sortPosition, itemId] of itemIds.entries()) await db.insert(householdShoppingCartItemStates).values({ cartId, itemId, checked: false, sortPosition, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [householdShoppingCartItemStates.cartId, householdShoppingCartItemStates.itemId], set: { sortPosition, updatedAt: now } }).run();
    } finally { await sqlite.close(); } revalidateAll(["/shopping-cart"]); return { status: "success", message: "Cart order saved." }; } catch (error) { return toErrorState(error, "Unable to save cart order."); }
  },
);

export const addAlwaysHaveIngredientAction = withActionLogging(
  "action.add_always_have_ingredient",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const canonicalIngredientId = String(formData.get("canonicalIngredientId") ?? "").trim();
    const dates = parseShoppingCartDates(formData.get("dates"));
    if (!canonicalIngredientId || dates.length === 0) return { status: "error", message: "Choose an ingredient from a shopping cart first." };
    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();
      try {
        const events = await db.query.householdRecipeEvents.findMany({
          where: (table, { and, eq, inArray: datesIn }) => and(eq(table.householdId, context.householdId), datesIn(table.date, dates)),
          with: { recipe: { with: { recipeInstructions: { with: { ingredients: true } } } } },
        });
        const isInCart = events.some((event) => event.recipe.recipeInstructions?.ingredients.some((ingredient) => ingredient.canonicalIngredientId === canonicalIngredientId));
        if (!isInCart) return { status: "error", message: "That ingredient is not in the selected shopping cart." };
        const now = new Date().toISOString();
        await db.insert(householdAlwaysHaveIngredients).values({ householdId: context.householdId, canonicalIngredientId, enabled: true, createdAt: now, updatedAt: now }).onConflictDoUpdate({
          target: [householdAlwaysHaveIngredients.householdId, householdAlwaysHaveIngredients.canonicalIngredientId],
          set: { enabled: true, updatedAt: now },
        }).run();
      } finally { await sqlite.close(); }
      revalidateAll(["/shopping-cart"]);
      return { status: "success", message: "Added to always haves." };
    } catch (error) { return toErrorState(error, "Unable to update always haves."); }
  },
);

export const setAlwaysHaveIngredientEnabledAction = withActionLogging(
  "action.set_always_have_ingredient_enabled",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const canonicalIngredientId = String(formData.get("canonicalIngredientId") ?? "").trim();
    const enabled = String(formData.get("enabled") ?? "") === "true";
    if (!canonicalIngredientId) return { status: "error", message: "Ingredient details are incomplete." };
    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();
      try {
        await db.update(householdAlwaysHaveIngredients).set({ enabled, updatedAt: new Date().toISOString() }).where(and(eq(householdAlwaysHaveIngredients.householdId, context.householdId), eq(householdAlwaysHaveIngredients.canonicalIngredientId, canonicalIngredientId))).run();
      } finally { await sqlite.close(); }
      revalidateAll(["/shopping-cart"]);
      return { status: "success", message: enabled ? "Always have enabled." : "Always have disabled." };
    } catch (error) { return toErrorState(error, "Unable to update always haves."); }
  },
);

export const removeAlwaysHaveIngredientAction = withActionLogging(
  "action.remove_always_have_ingredient",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const canonicalIngredientId = String(formData.get("canonicalIngredientId") ?? "").trim();
    if (!canonicalIngredientId) return { status: "error", message: "Ingredient details are incomplete." };
    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();
      try {
        await db.delete(householdAlwaysHaveIngredients).where(and(eq(householdAlwaysHaveIngredients.householdId, context.householdId), eq(householdAlwaysHaveIngredients.canonicalIngredientId, canonicalIngredientId))).run();
      } finally { await sqlite.close(); }
      revalidateAll(["/shopping-cart"]);
      return { status: "success", message: "Removed from always haves." };
    } catch (error) { return toErrorState(error, "Unable to update always haves."); }
  },
);

function parseShoppingCartDates(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return Array.isArray(parsed) ? [...new Set(parsed.filter((date): date is string => typeof date === "string" && isValidDayString(date)))].slice(0, 180) : [];
  } catch { return []; }
}

export const reviewIngredientAction = withActionLogging(
  "action.review_ingredient",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const ingredientId = String(formData.get("ingredientId") ?? "").trim();
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const action = String(formData.get("action") ?? "accept").trim();
  const ingredientText = String(formData.get("ingredientText") ?? "").trim();
  const amountText = toOptionalString(formData.get("amountText"));
  const unit = toOptionalString(formData.get("unit"));
  const notes = toOptionalString(formData.get("notes"));
  const canonicalIngredientId = toOptionalString(formData.get("canonicalIngredientId"));

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

      if (action === "reject") {
        await db.update(householdRecipeIngredients).set({
          canonicalIngredientId: null,
          normalizationStatus: "not_ingredient",
          reviewDisposition: "rejected",
          matchedBy: "review_rejected",
          aiSuggestionsJson: null,
          aiParseOutcome: null,
          aiParseReason: null,
        }).where(and(eq(householdRecipeIngredients.householdId, context.householdId), eq(householdRecipeIngredients.ingredientId, ingredientId))).run();
        return { status: "success", message: "Marked as not an ingredient." };
      }

      if (!ingredientText) {
        return { status: "error", message: "Tell us what the ingredient is before accepting it." };
      }

      const existingCanonical = canonicalIngredientId
        ? await db.query.householdCanonicalIngredients.findFirst({
            where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.canonicalIngredientId, canonicalIngredientId)),
            columns: { canonicalIngredientId: true },
          })
        : null;
      if (canonicalIngredientId && !existingCanonical) {
        return { status: "error", message: "That existing ingredient is no longer available." };
      }
      const canonicalIngredient = existingCanonical
        ? existingCanonical
        : await createCanonicalIngredient(db, context.householdId, ingredientText, {
            ingredientKind: "leaf",
            catalogStatus: "provisional",
          });
      const normalizedPhrase = normalizeIngredientKey(ingredientText);
      await upsertReviewedIngredientMapping({
        db, householdId: context.householdId, normalizedPhrase,
        canonicalIngredientId: canonicalIngredient.canonicalIngredientId,
        aliasText: ingredientText === ingredient.originalText ? ingredient.originalText : null,
        attributes: [],
      });
      await db.update(householdRecipeIngredients).set({
        originalText: ingredient.originalText,
        amountText, amountValue: null, amountMaxValue: null, unit,
        ingredientText, notes, normalizedIngredientPhrase: normalizedPhrase,
        canonicalIngredientId: canonicalIngredient.canonicalIngredientId,
        attributesJson: "[]", matchConfidence: 100, matchedBy: "confirmed_review",
        aiSuggestionsJson: null, aiParseOutcome: null, aiParseReason: null,
        normalizationStatus: "confirmed", reviewDisposition: "accepted",
      }).where(and(eq(householdRecipeIngredients.householdId, context.householdId), eq(householdRecipeIngredients.ingredientId, ingredientId))).run();
    } finally {
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId).concat("/settings/ingredients"));
    return {
      status: "success",
      message: "Ingredient accepted and saved for future imports.",
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

export const parseIngredientReviewPageWithAiAction = withActionLogging(
  "action.parse_ingredient_review_page_with_ai",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const rawPage = Number.parseInt(String(formData.get("page") ?? "1"), 10);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const recipeId = toOptionalString(formData.get("recipeId"));

    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();

      try {
        const config = await getStoredHouseholdAiConfig(context.householdId, db);
        if (!config) {
          return {
            status: "error",
            message: "Set up an active AI connection in Settings → AI before parsing ingredients.",
          };
        }

        const ingredients = await db.query.householdRecipeIngredients.findMany({
          where: (table, { and, eq }) => and(
            eq(table.householdId, context.householdId),
            eq(table.normalizationStatus, "needs_review"),
            eq(table.reviewDisposition, "pending"),
            recipeId ? eq(table.recipeId, recipeId) : undefined,
          ),
          orderBy: (table, { asc }) => [asc(table.recipeId), asc(table.position)],
          limit: 20,
          offset: (page - 1) * 20,
          columns: {
            ingredientId: true,
            originalText: true,
          },
        });

        if (ingredients.length === 0) {
          return { status: "error", message: "There are no pending ingredients on this page to parse." };
        }

        const parses = await getIngredientAiParses({
          householdId: context.householdId,
          ingredients,
          database: db,
        });

        if (!parses) {
          return {
            status: "error",
            message: "AI could not parse these ingredients. Check the connection and try again.",
          };
        }

        const counts = { parsed: 0, notIngredient: 0, unresolved: 0 };
        for (const parsed of parses) {
          const sharedValues = {
            normalizedIngredientPhrase: null,
            canonicalIngredientId: null,
            attributesJson: "[]",
            matchConfidence: null,
            matchedBy: "ai_parse",
            aiSuggestionsJson: null,
            aiParseOutcome: parsed.outcome,
            aiParseReason: parsed.reason,
            normalizationStatus: "needs_review",
            reviewDisposition: "pending",
          };

          if (parsed.outcome === "parsed") {
            await db.update(householdRecipeIngredients).set({
              ...sharedValues,
              amountText: parsed.amountText,
              amountValue: null,
              amountMaxValue: null,
              unit: parsed.unit,
              ingredientText: parsed.ingredientText,
              notes: parsed.notes,
            }).where(and(
              eq(householdRecipeIngredients.householdId, context.householdId),
              eq(householdRecipeIngredients.ingredientId, parsed.ingredientId),
            )).run();
            counts.parsed += 1;
          } else {
            await db.update(householdRecipeIngredients).set(sharedValues).where(and(
              eq(householdRecipeIngredients.householdId, context.householdId),
              eq(householdRecipeIngredients.ingredientId, parsed.ingredientId),
            )).run();
            if (parsed.outcome === "not_ingredient") counts.notIngredient += 1;
            else counts.unresolved += 1;
          }
        }

        const unchanged = ingredients.length - parses.length;
        revalidateAll(recipeScopedPaths(undefined, recipeId ?? undefined).concat("/settings/ingredients"));
        return {
          status: "success",
          message: `AI parsed ${counts.parsed}; flagged ${counts.notIngredient} as not an ingredient; could not fit ${counts.unresolved}; left ${unchanged} unchanged.`,
        };
      } finally {
        await sqlite.close();
      }
    } catch (error) {
      return toErrorState(error, "Unable to parse this page of ingredients with AI.");
    }
  },
  {
    getStartData: (_state, formData) => ({
      target: {
        recipeId: String(formData.get("recipeId") ?? "").trim() || null,
        page: String(formData.get("page") ?? "1"),
      },
    }),
  },
);

export const mergeCanonicalIngredientsAction = withActionLogging(
  "action.merge_canonical_ingredients",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const sourceId = String(formData.get("sourceCanonicalIngredientId") ?? "").trim();
    const targetId = String(formData.get("targetCanonicalIngredientId") ?? "").trim();
    if (!sourceId || !targetId || sourceId === targetId) return { status: "error", message: "Choose two different ingredients to merge." };
    try {
      const context = await requireHouseholdContext(); const { db, sqlite } = await openDatabase();
      try {
        const rows = await db.query.householdCanonicalIngredients.findMany({ where: (table, { and, eq, inArray }) => and(eq(table.householdId, context.householdId), inArray(table.canonicalIngredientId, [sourceId, targetId])), columns: { canonicalIngredientId: true, parentCanonicalIngredientId: true } });
        if (rows.length !== 2) return { status: "error", message: "One of those ingredients was not found." };
        const aliases = await db.query.householdIngredientAliases.findMany({ where: (table, { and, eq, inArray }) => and(eq(table.householdId, context.householdId), inArray(table.canonicalIngredientId, [sourceId, targetId])), columns: { aliasId: true, canonicalIngredientId: true, normalizedAlias: true } });
        const targetAliases = new Set(aliases.filter((alias) => alias.canonicalIngredientId === targetId).map((alias) => alias.normalizedAlias));
        const duplicateSourceAliasIds = aliases.filter((alias) => alias.canonicalIngredientId === sourceId && targetAliases.has(alias.normalizedAlias)).map((alias) => alias.aliasId);
        for (const aliasId of duplicateSourceAliasIds) await db.delete(householdIngredientAliases).where(eq(householdIngredientAliases.aliasId, aliasId)).run();
        const source = rows.find((row) => row.canonicalIngredientId === sourceId)!;
        const target = rows.find((row) => row.canonicalIngredientId === targetId)!;
        if (target.parentCanonicalIngredientId === sourceId) await db.update(householdCanonicalIngredients).set({ parentCanonicalIngredientId: source.parentCanonicalIngredientId, updatedAt: new Date().toISOString() }).where(eq(householdCanonicalIngredients.canonicalIngredientId, targetId)).run();
        await db.update(householdRecipeIngredients).set({ canonicalIngredientId: targetId }).where(and(eq(householdRecipeIngredients.householdId, context.householdId), eq(householdRecipeIngredients.canonicalIngredientId, sourceId))).run();
        await db.update(householdIngredientAliases).set({ canonicalIngredientId: targetId }).where(and(eq(householdIngredientAliases.householdId, context.householdId), eq(householdIngredientAliases.canonicalIngredientId, sourceId))).run();
        await db.update(householdIngredientPhraseMappings).set({ canonicalIngredientId: targetId }).where(and(eq(householdIngredientPhraseMappings.householdId, context.householdId), eq(householdIngredientPhraseMappings.canonicalIngredientId, sourceId))).run();
        const targetAlwaysHave = await db.query.householdAlwaysHaveIngredients.findFirst({
          where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.canonicalIngredientId, targetId)),
          columns: { alwaysHaveIngredientId: true },
        });
        if (targetAlwaysHave) {
          await db.delete(householdAlwaysHaveIngredients).where(and(eq(householdAlwaysHaveIngredients.householdId, context.householdId), eq(householdAlwaysHaveIngredients.canonicalIngredientId, sourceId))).run();
        } else {
          await db.update(householdAlwaysHaveIngredients).set({ canonicalIngredientId: targetId, updatedAt: new Date().toISOString() }).where(and(eq(householdAlwaysHaveIngredients.householdId, context.householdId), eq(householdAlwaysHaveIngredients.canonicalIngredientId, sourceId))).run();
        }
        await db.update(householdCanonicalIngredients).set({ parentCanonicalIngredientId: targetId, updatedAt: new Date().toISOString() }).where(and(eq(householdCanonicalIngredients.householdId, context.householdId), eq(householdCanonicalIngredients.parentCanonicalIngredientId, sourceId))).run();
        await db.delete(householdCanonicalIngredients).where(and(eq(householdCanonicalIngredients.householdId, context.householdId), eq(householdCanonicalIngredients.canonicalIngredientId, sourceId))).run();
      } finally { await sqlite.close(); }
      revalidateAll(["/settings/ingredients", "/shopping-cart"]); return { status: "success", message: "Ingredients merged." };
    } catch (error) { return toErrorState(error, "Unable to merge ingredients."); }
  },
);

export const reparentCanonicalIngredientAction = withActionLogging(
  "action.reparent_canonical_ingredient",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const ingredientId = String(formData.get("canonicalIngredientId") ?? "").trim();
    const parentId = toOptionalString(formData.get("parentCanonicalIngredientId"));
    if (!ingredientId || ingredientId === parentId) return { status: "error", message: "Choose a valid parent." };
    try {
      const context = await requireHouseholdContext(); const { db, sqlite } = await openDatabase();
      try {
        const ingredient = await db.query.householdCanonicalIngredients.findFirst({ where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.canonicalIngredientId, ingredientId)), columns: { canonicalIngredientId: true } });
        const parent = parentId ? await db.query.householdCanonicalIngredients.findFirst({ where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.canonicalIngredientId, parentId)), columns: { canonicalIngredientId: true, ingredientKind: true } }) : null;
        if (!ingredient || (parentId && (!parent || parent.ingredientKind !== "family"))) return { status: "error", message: "Choose an existing family as the parent." };
        await db.update(householdCanonicalIngredients).set({ parentCanonicalIngredientId: parentId, updatedAt: new Date().toISOString() }).where(and(eq(householdCanonicalIngredients.householdId, context.householdId), eq(householdCanonicalIngredients.canonicalIngredientId, ingredientId))).run();
      } finally { await sqlite.close(); }
      revalidateAll(["/settings/ingredients"]); return { status: "success", message: "Ingredient family updated." };
    } catch (error) { return toErrorState(error, "Unable to update ingredient family."); }
  },
);

export const removeUnusedProvisionalIngredientsAction = withActionLogging(
  "action.remove_unused_provisional_ingredients",
  async (): Promise<ActionState> => {
    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();
      let removed = 0;

      try {
        const candidates = await db.query.householdCanonicalIngredients.findMany({
          where: (table, { and, eq }) => and(
            eq(table.householdId, context.householdId),
            eq(table.catalogStatus, "provisional"),
          ),
          columns: { canonicalIngredientId: true },
        });

        for (const candidate of candidates) {
          const canonicalIngredientId = candidate.canonicalIngredientId;
          const [recipeUse, alternativeUse, alwaysHaveUse, child] = await Promise.all([
            db.query.householdRecipeIngredients.findFirst({
              where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.canonicalIngredientId, canonicalIngredientId)),
              columns: { ingredientId: true },
            }),
            db.query.householdRecipeIngredientAlternatives.findFirst({
              where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.canonicalIngredientId, canonicalIngredientId)),
              columns: { alternativeId: true },
            }),
            db.query.householdAlwaysHaveIngredients.findFirst({
              where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.canonicalIngredientId, canonicalIngredientId)),
              columns: { alwaysHaveIngredientId: true },
            }),
            db.query.householdCanonicalIngredients.findFirst({
              where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.parentCanonicalIngredientId, canonicalIngredientId)),
              columns: { canonicalIngredientId: true },
            }),
          ]);
          if (recipeUse || alternativeUse || alwaysHaveUse || child) continue;

          await db.delete(householdIngredientAliases).where(and(eq(householdIngredientAliases.householdId, context.householdId), eq(householdIngredientAliases.canonicalIngredientId, canonicalIngredientId))).run();
          await db.delete(householdIngredientPhraseMappings).where(and(eq(householdIngredientPhraseMappings.householdId, context.householdId), eq(householdIngredientPhraseMappings.canonicalIngredientId, canonicalIngredientId))).run();
          await db.delete(householdCanonicalIngredients).where(and(eq(householdCanonicalIngredients.householdId, context.householdId), eq(householdCanonicalIngredients.canonicalIngredientId, canonicalIngredientId))).run();
          removed += 1;
        }
      } finally {
        await sqlite.close();
      }

      revalidateAll(["/settings/ingredients", "/shopping-cart"]);
      return { status: "success", message: removed ? `Removed ${removed} unused provisional ingredient${removed === 1 ? "" : "s"}.` : "No unused provisional ingredients to remove." };
    } catch (error) {
      return toErrorState(error, "Unable to clean up the ingredient catalog.");
    }
  },
);

export const createRecipeVersionAction = withActionLogging(
  "action.create_recipe_version",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const recipeId = String(formData.get("recipeId") ?? "").trim();
    const ingredientLines = String(formData.get("ingredientLines") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const note = toOptionalString(formData.get("note"));

    if (!recipeId || ingredientLines.length === 0) {
      return { status: "error", message: "Add at least one ingredient to create a version." };
    }

    try {
      const context = await requireHouseholdContext();
      const { db, sqlite } = await openDatabase();
      const now = new Date().toISOString();
      try {
        const recipe = await db.query.householdRecipes.findFirst({
          where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
          with: {
            pin: true,
            recipeInstructions: { with: { ingredients: { orderBy: (table, { asc }) => [asc(table.position)] }, steps: { orderBy: (table, { asc }) => [asc(table.position)] } } },
          },
        });
        if (!recipe?.recipeInstructions) {
          return { status: "error", message: "This recipe needs structured content before it can be versioned." };
        }

        const versions = await db.query.householdRecipeVersions.findMany({
          where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
          orderBy: (table, { asc }) => [asc(table.versionNumber)],
        });
        const steps = recipe.recipeInstructions.steps.map((step) => ({ section: step.section, text: step.text }));
        const snapshot = buildRecipeVersionSnapshot(recipe);

        // Existing recipes are implicitly v1. Persist that snapshot before adding v2.
        if (versions.length === 0) {
          await db.insert(householdRecipeVersions).values({
            householdId: context.householdId,
            recipeId,
            versionNumber: 1,
            ingredientsJson: JSON.stringify(recipe.recipeInstructions.ingredients.map((item) => item.originalText)),
            stepsJson: JSON.stringify(steps),
            snapshotJson: JSON.stringify(snapshot),
            note: "Original recipe",
            createdByClerkUserId: context.clerkUserId,
            createdAt: recipe.createdAt,
          }).run();
        }
        const nextNumber = (versions.at(-1)?.versionNumber ?? 1) + 1;
        await db.insert(householdRecipeVersions).values({
          householdId: context.householdId,
          recipeId,
          versionNumber: nextNumber,
          ingredientsJson: JSON.stringify(ingredientLines),
          stepsJson: JSON.stringify(steps),
          snapshotJson: JSON.stringify({ ...snapshot, ingredients: ingredientLines.map((originalText, index) => ({ ...snapshot.ingredients[index], id: snapshot.ingredients[index]?.id ?? `version-ingredient-${index}`, originalText, displayText: originalText })) }),
          note,
          createdByClerkUserId: context.clerkUserId,
          createdAt: now,
        }).run();
      } finally {
        await sqlite.close();
      }
      revalidateAll(recipeScopedPaths(undefined, recipeId));
      return { status: "success", message: "New recipe version created. It is now the primary version." };
    } catch (error) {
      return toErrorState(error, "Unable to create the recipe version.");
    }
  },
);

export const saveRecipeContentAction = withActionLogging(
  "action.save_recipe_content",
  async (_: ActionState, formData: FormData): Promise<ActionState> => {
  const recipeId = String(formData.get("recipeId") ?? "").trim();
  const versionMode = String(formData.get("versionMode") ?? "").trim();
  const ingredients = parseRecipeContentItems(formData.get("ingredientsJson"), isRecipeIngredientInput);
  const steps = parseRecipeContentItems(formData.get("stepsJson"), isRecipeStepInput);

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }
  if (versionMode !== "update" && versionMode !== "new") {
    return { status: "error", message: "Choose whether to update this version or create a new one." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = await openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = await db.query.householdRecipes.findFirst({
          where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
          with: {
            pin: true,
            recipeInstructions: {
            with: {
              ingredients: true,
              steps: true,
            },
          },
        },
      });

      if (!recipe?.recipeInstructions) {
        return { status: "error", message: "This recipe does not have editable structured content yet." };
      }

      const knownIngredientIds = new Set(recipe.recipeInstructions.ingredients.map((ingredient) => ingredient.ingredientId));
      const knownStepIds = new Set(recipe.recipeInstructions.steps.map((step) => step.stepId));
      const priorSnapshot = buildRecipeVersionSnapshot(recipe);

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

      // Editing is intentionally allowed without creating a revision. If this
      // recipe already has versions, keep the primary snapshot in sync so the
      // edit belongs to that version rather than silently creating history.
      const primaryVersion = await db.query.householdRecipeVersions.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        orderBy: (table, { desc }) => [desc(table.versionNumber)],
      });
      const updatedSnapshot = {
        ...priorSnapshot,
        ingredients: ingredients.length > 0
          ? priorSnapshot.ingredients.map((ingredient) => ({ ...ingredient, originalText: ingredients.find((item) => item.id === ingredient.id)?.originalText.trim() ?? ingredient.originalText, displayText: ingredients.find((item) => item.id === ingredient.id)?.originalText.trim() ?? ingredient.displayText }))
          : priorSnapshot.ingredients,
        steps: steps.length > 0
          ? priorSnapshot.steps.map((step) => ({ ...step, section: steps.find((item) => item.id === step.id)?.section?.trim() || null, text: steps.find((item) => item.id === step.id)?.text.trim() ?? step.text }))
          : priorSnapshot.steps,
      };
      if (primaryVersion && versionMode === "update") {
        await db.update(householdRecipeVersions)
          .set({
            ingredientsJson: ingredients.length > 0 ? JSON.stringify(ingredients.map((item) => item.originalText.trim())) : primaryVersion.ingredientsJson,
            stepsJson: steps.length > 0 ? JSON.stringify(steps.map((item) => ({ section: item.section?.trim() || null, text: item.text.trim() }))) : primaryVersion.stepsJson,
            snapshotJson: JSON.stringify(updatedSnapshot),
          })
          .where(eq(householdRecipeVersions.recipeVersionId, primaryVersion.recipeVersionId))
          .run();
      } else if (versionMode === "new") {
        if (!primaryVersion) {
          await db.insert(householdRecipeVersions).values({
            householdId: context.householdId, recipeId, versionNumber: 1,
            ingredientsJson: JSON.stringify(priorSnapshot.ingredients.map((item) => item.originalText)),
            stepsJson: JSON.stringify(priorSnapshot.steps.map((item) => ({ section: item.section, text: item.text }))),
            snapshotJson: JSON.stringify(priorSnapshot), note: "Original recipe",
            createdByClerkUserId: context.clerkUserId, createdAt: recipe.createdAt,
          }).run();
        }
        await db.insert(householdRecipeVersions).values({
          householdId: context.householdId, recipeId, versionNumber: (primaryVersion?.versionNumber ?? 1) + 1,
          ingredientsJson: JSON.stringify(updatedSnapshot.ingredients.map((item) => item.originalText)),
          stepsJson: JSON.stringify(updatedSnapshot.steps.map((item) => ({ section: item.section, text: item.text }))),
          snapshotJson: JSON.stringify(updatedSnapshot), note: null,
          createdByClerkUserId: context.clerkUserId, createdAt: now,
        }).run();
      }
    } finally {
      await sqlite.close();
    }

    revalidateAll(recipeScopedPaths(undefined, recipeId));
    return {
      status: "success",
      message: versionMode === "new" ? "New recipe version created." : "Updated the current recipe version.",
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
  const versionMode = String(formData.get("versionMode") ?? "").trim();
  const hasContentEdits = formData.has("ingredientsJson") || formData.has("stepsJson");
  const ingredients = parseRecipeContentItems(formData.get("ingredientsJson"), isRecipeIngredientInput);
  const steps = parseRecipeContentItems(formData.get("stepsJson"), isRecipeStepInput);

  if (!recipeId) {
    return { status: "error", message: "Recipe ID is required." };
  }

  if (!title) {
    return { status: "error", message: "Title cannot be empty." };
  }

  if (versionMode !== "update" && versionMode !== "new") {
    return { status: "error", message: "Choose whether to save the current version or create a new one." };
  }

  try {
    const context = await requireHouseholdContext();
    const { db, sqlite } = await openDatabase();
    const now = new Date().toISOString();

    try {
      const recipe = await db.query.householdRecipes.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
        with: {
          pin: true,
          recipeInstructions: {
            with: {
              ingredients: true,
              steps: true,
            },
          },
        },
      });

      if (!recipe) {
        return { status: "error", message: "Recipe was not found." };
      }

      if (hasContentEdits) {
        if (!recipe.recipeInstructions) {
          return { status: "error", message: "This recipe does not have editable structured content yet." };
        }

        const knownIngredientIds = new Set(recipe.recipeInstructions.ingredients.map((ingredient) => ingredient.ingredientId));
        const knownStepIds = new Set(recipe.recipeInstructions.steps.map((step) => step.stepId));
        const submittedIngredientIds = new Set<string>();
        const submittedStepIds = new Set<string>();
        if (ingredients.some((ingredient) => (!knownIngredientIds.has(ingredient.id) && !isNewRecipeContentItem(ingredient.id)) || !ingredient.ingredientText?.trim() || submittedIngredientIds.has(ingredient.id) || !submittedIngredientIds.add(ingredient.id))) {
          return { status: "error", message: "One or more ingredient edits are invalid." };
        }
        if (steps.some((step) => (!knownStepIds.has(step.id) && !isNewRecipeContentItem(step.id)) || !step.text.trim() || submittedStepIds.has(step.id) || !submittedStepIds.add(step.id))) {
          return { status: "error", message: "One or more instruction edits are invalid." };
        }

        const deletedIngredientIds = [...knownIngredientIds].filter((id) => !submittedIngredientIds.has(id));
        const deletedStepIds = [...knownStepIds].filter((id) => !submittedStepIds.has(id));
        if (deletedIngredientIds.length > 0) {
          await db.delete(householdRecipeIngredientAlternatives)
            .where(and(eq(householdRecipeIngredientAlternatives.recipeId, recipeId), inArray(householdRecipeIngredientAlternatives.ingredientId, deletedIngredientIds)))
            .run();
          await db.delete(householdRecipeIngredients)
            .where(and(eq(householdRecipeIngredients.recipeId, recipeId), eq(householdRecipeIngredients.householdId, context.householdId), inArray(householdRecipeIngredients.ingredientId, deletedIngredientIds)))
            .run();
        }
        if (deletedStepIds.length > 0) {
          await db.delete(householdRecipeSteps)
            .where(and(eq(householdRecipeSteps.recipeId, recipeId), eq(householdRecipeSteps.householdId, context.householdId), inArray(householdRecipeSteps.stepId, deletedStepIds)))
            .run();
        }

        for (const [position, ingredient] of ingredients.entries()) {
          if (isNewRecipeContentItem(ingredient.id)) {
            await db.insert(householdRecipeIngredients).values({
              ingredientId: crypto.randomUUID(), householdId: context.householdId, recipeId, position,
              ...toStructuredIngredientValues(ingredient),
              normalizedIngredientPhrase: null, canonicalIngredientId: null, attributesJson: "[]",
              matchConfidence: null, matchedBy: "manual_entry", aiSuggestionsJson: null,
              normalizationStatus: "needs_review",
            }).run();
            continue;
          }
          await db.update(householdRecipeIngredients)
            .set({ ...toStructuredIngredientValues(ingredient), position })
            .where(and(eq(householdRecipeIngredients.recipeId, recipeId), eq(householdRecipeIngredients.householdId, context.householdId), eq(householdRecipeIngredients.ingredientId, ingredient.id)))
            .run();
        }
        for (const [position, step] of steps.entries()) {
          if (isNewRecipeContentItem(step.id)) {
            await db.insert(householdRecipeSteps).values({
              stepId: crypto.randomUUID(), householdId: context.householdId, recipeId, position,
              section: step.section?.trim() || null, rawText: step.text.trim(), text: step.text.trim(),
            }).run();
            continue;
          }
          await db.update(householdRecipeSteps)
            .set({ section: step.section?.trim() || null, rawText: step.text.trim(), text: step.text.trim(), position })
            .where(and(eq(householdRecipeSteps.recipeId, recipeId), eq(householdRecipeSteps.householdId, context.householdId), eq(householdRecipeSteps.stepId, step.id)))
            .run();
        }

        const primaryVersion = await db.query.householdRecipeVersions.findFirst({
          where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
          orderBy: (table, { desc }) => [desc(table.versionNumber)],
        });
        const [savedIngredients, savedSteps] = await Promise.all([
          db.query.householdRecipeIngredients.findMany({
            where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
            orderBy: (table, { asc }) => [asc(table.position)],
          }),
          db.query.householdRecipeSteps.findMany({
            where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
            orderBy: (table, { asc }) => [asc(table.position)],
          }),
        ]);
        const updatedSnapshot = buildRecipeVersionSnapshot({
          ...recipe,
          title,
          description: description || null,
          recipeInstructions: { ...recipe.recipeInstructions, ingredients: savedIngredients, steps: savedSteps },
        });
        if (primaryVersion && versionMode === "update") {
          await db.update(householdRecipeVersions)
            .set({
              ingredientsJson: JSON.stringify(updatedSnapshot.ingredients.map((item) => item.originalText)),
              stepsJson: JSON.stringify(updatedSnapshot.steps.map((item) => ({ section: item.section, text: item.text }))),
              snapshotJson: JSON.stringify(updatedSnapshot),
            })
            .where(eq(householdRecipeVersions.recipeVersionId, primaryVersion.recipeVersionId))
            .run();
        } else if (versionMode === "new") {
          const priorSnapshot = buildRecipeVersionSnapshot(recipe);
          if (!primaryVersion) {
            await db.insert(householdRecipeVersions).values({
              householdId: context.householdId, recipeId, versionNumber: 1,
              ingredientsJson: JSON.stringify(priorSnapshot.ingredients.map((item) => item.originalText)),
              stepsJson: JSON.stringify(priorSnapshot.steps.map((item) => ({ section: item.section, text: item.text }))),
              snapshotJson: JSON.stringify(priorSnapshot), note: "Original recipe",
              createdByClerkUserId: context.clerkUserId, createdAt: recipe.createdAt,
            }).run();
          }
          await db.insert(householdRecipeVersions).values({
            householdId: context.householdId, recipeId, versionNumber: (primaryVersion?.versionNumber ?? 1) + 1,
            ingredientsJson: JSON.stringify(updatedSnapshot.ingredients.map((item) => item.originalText)),
            stepsJson: JSON.stringify(updatedSnapshot.steps.map((item) => ({ section: item.section, text: item.text }))),
            snapshotJson: JSON.stringify(updatedSnapshot), note: null,
            createdByClerkUserId: context.clerkUserId, createdAt: now,
          }).run();
        }
      }

      if (!hasContentEdits && versionMode === "new") {
        const primaryVersion = await db.query.householdRecipeVersions.findFirst({
          where: (table, { and, eq }) => and(eq(table.recipeId, recipeId), eq(table.householdId, context.householdId)),
          orderBy: (table, { desc }) => [desc(table.versionNumber)],
        });
        const priorSnapshot = buildRecipeVersionSnapshot(recipe);
        const updatedSnapshot = buildRecipeVersionSnapshot({ ...recipe, title, description: description || null });
        if (!primaryVersion) {
          await db.insert(householdRecipeVersions).values({
            householdId: context.householdId, recipeId, versionNumber: 1,
            ingredientsJson: JSON.stringify(priorSnapshot.ingredients.map((item) => item.originalText)),
            stepsJson: JSON.stringify(priorSnapshot.steps.map((item) => ({ section: item.section, text: item.text }))),
            snapshotJson: JSON.stringify(priorSnapshot), note: "Original recipe",
            createdByClerkUserId: context.clerkUserId, createdAt: recipe.createdAt,
          }).run();
        }
        await db.insert(householdRecipeVersions).values({
          householdId: context.householdId, recipeId, versionNumber: (primaryVersion?.versionNumber ?? 1) + 1,
          ingredientsJson: JSON.stringify(updatedSnapshot.ingredients.map((item) => item.originalText)),
          stepsJson: JSON.stringify(updatedSnapshot.steps.map((item) => ({ section: item.section, text: item.text }))),
          snapshotJson: JSON.stringify(updatedSnapshot), note: null,
          createdByClerkUserId: context.clerkUserId, createdAt: now,
        }).run();
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
      message: versionMode === "new" ? "New recipe version created." : "Saved the recipe details.",
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

  if (ratingValue === null) {
    return { status: "error", message: "Choose a rating between 0 and 5 stars." };
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

      const primaryVersion = await db.query.householdRecipeVersions.findFirst({
        where: (table, { and, eq }) => and(eq(table.recipeId, recipe.recipeId), eq(table.householdId, context.householdId)),
        orderBy: (table, { desc }) => [desc(table.versionNumber)],
        columns: { recipeVersionId: true },
      });

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
          recipeVersionId: primaryVersion?.recipeVersionId ?? null,
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

  if (ratingValue === null) {
    return { status: "error", message: "Choose a rating between 0 and 5 stars." };
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
type RecipeIngredientInput = { id: string; originalText: string; amountText?: string | null; unit?: string | null; ingredientText?: string | null; notes: string | null };
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
  return typeof item.id === "string" && typeof item.originalText === "string" &&
    (typeof item.notes === "string" || item.notes === null) &&
    (item.amountText === undefined || typeof item.amountText === "string" || item.amountText === null) &&
    (item.unit === undefined || typeof item.unit === "string" || item.unit === null) &&
    (item.ingredientText === undefined || typeof item.ingredientText === "string" || item.ingredientText === null);
}

function toStructuredIngredientValues(ingredient: RecipeIngredientInput) {
  const amountText = ingredient.amountText?.trim() || null;
  const unit = ingredient.unit?.trim() || null;
  const ingredientText = ingredient.ingredientText?.trim() || ingredient.originalText.trim();
  const notes = ingredient.notes?.trim() || null;
  const { amountValue, amountMaxValue } = amountText ? parseAmountText(amountText) : { amountValue: null, amountMaxValue: null };
  return {
    originalText: formatIngredientOriginalText({ amountText, unit, ingredientText, notes }),
    amountText,
    amountValue,
    amountMaxValue,
    unit,
    ingredientText,
    notes,
  };
}

function isRecipeStepInput(value: unknown): value is RecipeStepInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.text === "string" && (typeof item.section === "string" || item.section === null);
}

function isNewRecipeContentItem(id: string) {
  return id.startsWith("new-");
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
  const parsed = Number(String(value ?? ""));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < 0 || parsed > 5) {
    return null;
  }

  return Math.round(parsed * 10) === parsed * 10 ? parsed : null;
}

function buildRecipeVersionSnapshot(recipe: {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  pin: { title: string | null; description: string | null; dominantColor: string | null; link: string | null; mediaJson: string | null; rawJson: string };
  recipeInstructions: {
    title: string | null; description: string | null; imageUrl: string | null;
    canonicalUrl: string | null; yieldText: string | null; prepTime: string | null; cookTime: string | null; totalTime: string | null;
    ingredients: Array<{ ingredientId: string; originalText: string; amountText: string | null; amountValue: number | null; amountMaxValue: number | null; unit: string | null; ingredientText: string | null; notes: string | null; canonicalIngredientId: string | null; attributesJson: string | null; normalizationStatus: string }>;
    steps: Array<{ stepId: string; section: string | null; text: string }>;
  } | null;
}) {
  const instructions = recipe.recipeInstructions;
  const imageSources = resolveRecipeImageSources(recipe.imageUrl, instructions?.imageUrl, recipe.pin.mediaJson, recipe.pin.rawJson);
  return {
    title: recipe.title ?? recipe.pin.title ?? instructions?.title ?? "Untitled recipe",
    description: recipe.description ?? recipe.pin.description ?? instructions?.description ?? null,
    imageUrl: imageSources.imageUrl,
    sourceUrl: instructions?.canonicalUrl ?? recipe.pin.link,
    dominantColor: recipe.pin.dominantColor,
    yieldText: instructions?.yieldText ?? null,
    prepTime: instructions?.prepTime ?? null,
    cookTime: instructions?.cookTime ?? null,
    totalTime: instructions?.totalTime ?? null,
    ingredients: (instructions?.ingredients ?? []).map((ingredient) => ({
      id: ingredient.ingredientId, originalText: ingredient.originalText, displayText: ingredient.originalText,
      amount: ingredient.amountText, amountValue: ingredient.amountValue, amountMaxValue: ingredient.amountMaxValue,
      unit: ingredient.unit, parsedText: ingredient.ingredientText, notes: ingredient.notes,
      canonicalIngredientId: ingredient.canonicalIngredientId, canonicalName: null,
      attributes: ingredient.attributesJson ? JSON.parse(ingredient.attributesJson) : [],
      normalizationStatus: ingredient.normalizationStatus === "confirmed" ? "confirmed" : ingredient.normalizationStatus === "auto_matched" ? "auto_matched" : "needs_review",
    })),
    steps: (instructions?.steps ?? []).map((step) => ({ id: step.stepId, section: step.section, text: step.text })),
  };
}

function parseCustomRecipeLines(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
      : [];
  } catch {
    return [];
  }
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
