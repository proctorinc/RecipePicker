import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  getHouseholdAiConnectionStatus,
  generateRecipePickerWithHouseholdAi,
} from "@/lib/server/ai-provider";
import { requireHouseholdContext } from "@/lib/server/auth";
import { openDatabase } from "@/lib/server/database";
import {
  resolveIngredientSearchQuery,
  normalizeIngredientKey,
} from "@/lib/server/ingredient-normalization";
import {
  householdRecipePickerConversations,
  householdRecipePickerMessages,
} from "@/lib/server/db";
import { resolveRecipeImageSources } from "@/lib/recipe-image-sources";
import { parseJsonArray } from "@/lib/utils";
import type {
  RecipePickerCard,
  RecipePickerChatMessage,
  RecipePickerConversationSummary,
  RecipePickerInlineRecipeRef,
  RecipePickerIntent,
  RecipePickerMessageSegment,
  RecipePickerModeAvailability,
  RecipePickerRequest,
  RecipePickerResponse,
} from "@/types/recipe-picker";

const TARGET_SET_SIZE = 7;
const MIN_SET_SIZE = 3;
const MODE_AVAILABILITY: RecipePickerModeAvailability = {
  v1: true,
  v2: false,
};

const pickerAiSchema = z
  .object({
    intent: z.enum(["replace_set", "refine_set", "add_to_set"]),
    mustIncludeIngredients: z.array(z.string()).max(8),
    mustExcludeIngredients: z.array(z.string()).max(8),
    mealTypes: z.array(z.string()).max(6),
    titleTerms: z.array(z.string()).max(6),
    keywordTerms: z.array(z.string()).max(8),
    cuisineTerms: z.array(z.string()).max(4),
    timeHint: z.string().nullable(),
    similarToLikedRecipeIds: z.array(z.string()).max(4),
    similarToCurrentRecipeIds: z.array(z.string()).max(4),
    reviewTerms: z.array(z.string()).max(8),
    preferHighlyRated: z.boolean(),
    preferRecipesYouLike: z.boolean(),
    assistantMessage: z.string(),
    followUpQuestions: z.array(z.string()).max(4),
    explanation: z.string(),
  })
  .strict();

type RecipePickerRow = Awaited<ReturnType<typeof getRecipePickerRows>>[number];
type ConversationRow = Awaited<ReturnType<typeof getConversationRows>>[number];
type ConversationMessageRow = ConversationRow["messages"][number];

type RecipeCandidate = {
  recipeId: string;
  title: string;
  imageUrl: string | null;
  previewImageUrl: string | null;
  siteName: string | null;
  shortDescription: string | null;
  averageRating: number | null;
  reviewCount: number;
  reviewNotes: string[];
  updatedAt: string;
  ingredients: Array<{
    canonicalIngredientId: string | null;
    canonicalName: string | null;
    ingredientText: string | null;
    originalText: string;
    normalizedIngredientPhrase: string | null;
    attributes: string[];
  }>;
  categories: string[];
  keywords: string[];
  cuisine: string | null;
  timeText: string;
  searchText: string;
  matchText: string;
  reviewText: string;
  pinTitle: string | null;
  score: number;
  matchedReasons: string[];
  isStrongMatch: boolean;
};

export type TestRecipeCandidate = RecipeCandidate;

type IngredientResolution = Awaited<ReturnType<typeof resolveIngredientSearchQuery>>;

type PickerInterpretation = {
  intent: RecipePickerIntent;
  mustIncludeIngredients: string[];
  mustExcludeIngredients: string[];
  mealTypes: string[];
  titleTerms: string[];
  keywordTerms: string[];
  cuisineTerms: string[];
  timeHint: string | null;
  similarToLikedRecipeIds: string[];
  similarToCurrentRecipeIds: string[];
  reviewTerms: string[];
  preferHighlyRated: boolean;
  preferRecipesYouLike: boolean;
  assistantMessage?: string;
  followUpQuestions?: string[];
  explanation: string;
};

type ScoreContext = {
  includeIngredientResolutions: NonNullable<IngredientResolution>[];
  excludeIngredientResolutions: NonNullable<IngredientResolution>[];
  interpretation: PickerInterpretation;
  pinnedRecipeIds: Set<string>;
  currentSetRecipeIds: string[];
  recipeMap: Map<string, RecipeCandidate>;
};

type GeneratedTurn = {
  intent: RecipePickerIntent;
  setExplanation: string;
  assistantMessage: string;
  suggestedPrompts: string[];
  recipes: RecipePickerCard[];
  pinnedRecipeIds: string[];
  activeIndex: number;
  requiresAiSetup: boolean;
  modeAvailability: RecipePickerModeAvailability;
};

type ParsedInlineRecipeMessage = {
  inlineRecipeRefs: RecipePickerInlineRecipeRef[];
  segments: RecipePickerMessageSegment[];
};

const FALLBACK_MEAL_TYPES = new Set([
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "dessert",
  "side dish",
  "salad",
  "snack",
  "meal prep",
  "main course",
]);

const FALLBACK_KEYWORDS = new Set([
  "comfort food",
  "healthy",
  "high protein",
  "creamy",
  "crispy",
  "fresh",
  "crunchy",
  "light",
  "spicy",
  "quick",
  "easy",
]);

const FALLBACK_CUISINES = new Set([
  "american",
  "italian",
  "korean",
  "mexican",
  "chinese",
  "japanese",
  "thai",
  "indian",
  "greek",
  "french",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "give",
  "i",
  "it",
  "like",
  "me",
  "more",
  "of",
  "on",
  "please",
  "recipe",
  "recipes",
  "show",
  "something",
  "that",
  "the",
  "these",
  "those",
  "really",
  "to",
  "using",
  "want",
  "with",
]);

export async function getRecipePickerInitialState(): Promise<RecipePickerResponse> {
  const context = await requireHouseholdContext();
  const conversationId = await ensureRecipePickerConversation({
    householdId: context.householdId,
    clerkUserId: context.clerkUserId,
  });

  return getRecipePickerConversationState({
    householdId: context.householdId,
    clerkUserId: context.clerkUserId,
    conversationId,
  });
}

export async function createRecipePickerConversation(args: {
  householdId: string;
  clerkUserId: string;
}): Promise<RecipePickerResponse> {
  const conversationId = await insertRecipePickerConversation(args);
  return getRecipePickerConversationState({
    householdId: args.householdId,
    clerkUserId: args.clerkUserId,
    conversationId,
  });
}

export async function getRecipePickerConversationState(args: {
  householdId: string;
  clerkUserId: string;
  conversationId: string;
}): Promise<RecipePickerResponse> {
  const aiConnectionStatus = await getHouseholdAiConnectionStatus(args.householdId);
  const requiresAiSetup = aiConnectionStatus !== "active";
  const { db, sqlite } = await openDatabase();

  try {
    const conversations = await getConversationRows(db, args.householdId);
    const threadSummaries = conversations.map(toConversationSummary);
    const conversation =
      conversations.find(
        (entry) => entry.conversationId === args.conversationId,
      ) ??
      conversations[0] ??
      null;

    if (!conversation) {
      const conversationId = await insertRecipePickerConversation(args);
      return {
        ...(await getRecipePickerConversationState({
          ...args,
          conversationId,
        })),
      };
    }

    const messages = conversation.messages.map((message) =>
      toChatMessage(message),
    );
    const activeAssistantMessage =
      [...messages].reverse().find((message) => message.role === "assistant") ??
      null;
    const recipes = activeAssistantMessage?.recipeSnapshot ?? [];
    const pinnedRecipeIds = activeAssistantMessage?.pinnedRecipeIds ?? [];
    const activeRecipeId = activeAssistantMessage?.activeRecipeId ?? null;
    const activeIndex = resolveActiveIndexFromCards(recipes, activeRecipeId);

    return {
      conversationId: conversation.conversationId,
      activeMessageId: activeAssistantMessage?.messageId ?? null,
      intent: (activeAssistantMessage?.intent ??
        "replace_set") as RecipePickerIntent,
      setExplanation: "",
      assistantMessage: activeAssistantMessage?.bodyText ?? "",
      suggestedPrompts: activeAssistantMessage?.suggestedPrompts ?? [],
      recipes,
      pinnedRecipeIds,
      activeIndex,
      requiresAiSetup,
      modeAvailability: MODE_AVAILABILITY,
      messages,
      threadSummaries,
    };
  } finally {
    await sqlite.close();
  }
}

export async function runRecipePicker(args: {
  householdId: string;
  clerkUserId: string;
  request: RecipePickerRequest;
}): Promise<RecipePickerResponse> {
  const request = normalizeRequest(args.request);
  const conversationId =
    request.conversationId ??
    (await ensureRecipePickerConversation({
      householdId: args.householdId,
      clerkUserId: args.clerkUserId,
    }));
  const generated = await generateRecipePickerTurn({
    householdId: args.householdId,
    request,
  });
  const now = new Date().toISOString();
  const inlineParsed = parseInlineRecipeReferences(
    generated.assistantMessage,
    new Map(generated.recipes.map((recipe) => [recipe.recipeId, recipe])),
  );
  const { db, sqlite } = await openDatabase();

  try {
    const conversation = await db.query.householdRecipePickerConversations
      .findFirst({
        where: (table, { eq: whereEq }) =>
          and(
            whereEq(table.conversationId, conversationId),
            whereEq(table.householdId, args.householdId),
          ),
        with: {
          messages: {
            orderBy: (table, { asc }) => [asc(table.position)],
          },
        },
      });

    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const nextPosition = conversation.messages.length;
    const nextTitle =
      conversation.title ?? deriveConversationTitle(request.prompt);

    await db.insert(householdRecipePickerMessages)
      .values([
        {
          conversationId,
          householdId: args.householdId,
          role: "user",
          position: nextPosition,
          bodyText: request.prompt,
          intent: null,
          inlineRecipeRefsJson: null,
          recipeSnapshotJson: null,
          pinnedRecipeIdsJson: JSON.stringify(request.pinnedRecipeIds),
          activeRecipeId: request.activeRecipeId ?? null,
          suggestedPromptsJson: JSON.stringify([]),
          createdAt: now,
        },
        {
          conversationId,
          householdId: args.householdId,
          role: "assistant",
          position: nextPosition + 1,
          bodyText: generated.assistantMessage,
          intent: generated.intent,
          inlineRecipeRefsJson: JSON.stringify(inlineParsed.inlineRecipeRefs),
          recipeSnapshotJson: JSON.stringify(generated.recipes),
          pinnedRecipeIdsJson: JSON.stringify(generated.pinnedRecipeIds),
          activeRecipeId:
            generated.recipes[generated.activeIndex]?.recipeId ?? null,
          suggestedPromptsJson: JSON.stringify(generated.suggestedPrompts),
          createdAt: now,
        },
      ])
      .run();

    await db.update(householdRecipePickerConversations)
      .set({
        title: nextTitle,
        lastMessageAt: now,
        updatedAt: now,
      })
      .where(
        eq(householdRecipePickerConversations.conversationId, conversationId),
      )
      .run();
  } finally {
    await sqlite.close();
  }

  return getRecipePickerConversationState({
    householdId: args.householdId,
    clerkUserId: args.clerkUserId,
    conversationId,
  });
}

async function insertRecipePickerConversation(args: {
  householdId: string;
  clerkUserId: string;
}) {
  const now = new Date().toISOString();
  const { db, sqlite } = await openDatabase();

  try {
    const row = await db
      .insert(householdRecipePickerConversations)
      .values({
        householdId: args.householdId,
        createdByClerkUserId: args.clerkUserId,
        title: null,
        status: "active",
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return row.conversationId;
  } finally {
    await sqlite.close();
  }
}

async function ensureRecipePickerConversation(args: {
  householdId: string;
  clerkUserId: string;
}) {
  const { db, sqlite } = await openDatabase();

  try {
    const existing = await db.query.householdRecipePickerConversations
      .findFirst({
        where: (table, { eq }) => eq(table.householdId, args.householdId),
        orderBy: (table, { desc }) => [desc(table.updatedAt)],
      });

    if (existing) {
      return existing.conversationId;
    }
  } finally {
    await sqlite.close();
  }

  return insertRecipePickerConversation(args);
}

async function getConversationRows(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  householdId: string,
) {
  return await db.query.householdRecipePickerConversations
    .findMany({
      where: (table, { eq }) => eq(table.householdId, householdId),
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      with: {
        messages: {
          orderBy: (table, { asc }) => [asc(table.position)],
        },
      },
    });
}

async function generateRecipePickerTurn(args: {
  householdId: string;
  request: RecipePickerRequest;
}): Promise<GeneratedTurn> {
  const request = normalizeRequest(args.request);
  const aiConnectionStatus = await getHouseholdAiConnectionStatus(args.householdId);
  const requiresAiSetup = aiConnectionStatus !== "active";
  const { db, sqlite } = await openDatabase();

  try {
    const recipes = buildRecipeCandidates(
      await getRecipePickerRows(db, args.householdId),
    );
    const recipeMap = new Map(
      recipes.map((recipe) => [recipe.recipeId, recipe]),
    );
    const interpretation =
      request.prompt.trim().length > 0 && !requiresAiSetup
        ? ((await interpretRecipePrompt({
            householdId: args.householdId,
            prompt: request.prompt,
            currentSetRecipeIds: request.currentSetRecipeIds,
            pinnedRecipeIds: request.pinnedRecipeIds,
            activeRecipeId: request.activeRecipeId ?? null,
            recipeMap,
          })) ??
          fallbackInterpretRecipePrompt({
            prompt: request.prompt,
            currentSetRecipeIds: request.currentSetRecipeIds,
            pinnedRecipeIds: request.pinnedRecipeIds,
            activeRecipeId: request.activeRecipeId ?? null,
            recipeMap,
          }))
        : fallbackInterpretRecipePrompt({
            prompt: request.prompt,
            currentSetRecipeIds: request.currentSetRecipeIds,
            pinnedRecipeIds: request.pinnedRecipeIds,
            activeRecipeId: request.activeRecipeId ?? null,
            recipeMap,
          });

    const includeIngredientResolutions = (
      await Promise.all(
        interpretation.mustIncludeIngredients.map((term) =>
          resolveIngredientSearchQuery(db, args.householdId, term),
        ),
      )
    ).filter((value): value is NonNullable<IngredientResolution> =>
      Boolean(value),
    );
    const excludeIngredientResolutions = (
      await Promise.all(
        interpretation.mustExcludeIngredients.map((term) =>
          resolveIngredientSearchQuery(db, args.householdId, term),
        ),
      )
    ).filter((value): value is NonNullable<IngredientResolution> =>
      Boolean(value),
    );

    const scoreContext: ScoreContext = {
      includeIngredientResolutions,
      excludeIngredientResolutions,
      interpretation,
      pinnedRecipeIds: new Set(request.pinnedRecipeIds),
      currentSetRecipeIds: request.currentSetRecipeIds,
      recipeMap,
    };

    const ranked = recipes
      .map((recipe) => scoreRecipeCandidate(recipe, scoreContext))
      .filter((recipe) => !isExcludedRecipe(recipe, scoreContext))
      .sort(compareRankedRecipes);

    const selected = buildRecipePickerSet({
      candidates: ranked,
      currentSetRecipeIds: request.currentSetRecipeIds,
      pinnedRecipeIds: request.pinnedRecipeIds,
      intent: interpretation.intent,
    });
    const recipeCards = selected.map((recipe) =>
      toRecipePickerCard(recipe, request.pinnedRecipeIds),
    );
    const assistantMessage = buildAssistantMessage({
      interpretation,
      request,
      requiresAiSetup,
      selected,
      recipeCards,
    });

    return {
      intent: interpretation.intent,
      setExplanation: buildSetExplanation({
        interpretation,
        request,
        requiresAiSetup,
        selected,
      }),
      assistantMessage,
      suggestedPrompts: buildSuggestedPrompts({
        interpretation,
        request,
        selected,
        requiresAiSetup,
      }),
      recipes: recipeCards,
      pinnedRecipeIds: request.pinnedRecipeIds.filter((recipeId) =>
        recipeCards.some((recipe) => recipe.recipeId === recipeId),
      ),
      activeIndex: resolveActiveIndex(selected, request.activeRecipeId),
      requiresAiSetup,
      modeAvailability: MODE_AVAILABILITY,
    };
  } finally {
    await sqlite.close();
  }
}

async function interpretRecipePrompt(args: {
  householdId: string;
  prompt: string;
  currentSetRecipeIds: string[];
  pinnedRecipeIds: string[];
  activeRecipeId: string | null;
  recipeMap: Map<string, RecipeCandidate>;
}) {
  const orderedCurrentRecipes = args.currentSetRecipeIds
    .map((recipeId, index) => {
      const recipe = args.recipeMap.get(recipeId);
      if (!recipe) {
        return null;
      }

      return `${index + 1}. ${recipe.recipeId} | ${recipe.title}`;
    })
    .filter(Boolean)
    .join("\n");
  const topRatedRecipes = [...args.recipeMap.values()]
    .filter((recipe) => recipe.reviewCount > 0)
    .sort((left, right) => compareRecipesByPreferenceSignal(left, right))
    .slice(0, 10)
    .map((recipe) => {
      const notes = recipe.reviewNotes
        .slice(0, 2)
        .map((note) => `"${trimForPrompt(note, 120)}"`)
        .join("; ");
      const summary = `${recipe.recipeId} | ${recipe.title} | ${formatReviewSummary(recipe)}`;
      return notes ? `${summary} | Review notes: ${notes}` : summary;
    })
    .join("\n");
  const pinnedRecipes = args.pinnedRecipeIds
    .map((recipeId) => {
      const recipe = args.recipeMap.get(recipeId);
      return recipe ? `${recipe.recipeId} | ${recipe.title}` : null;
    })
    .filter(Boolean)
    .join("\n");
  const selectedRecipes = args.currentSetRecipeIds
    .map((recipeId) => args.recipeMap.get(recipeId))
    .filter((value): value is RecipeCandidate => Boolean(value))
    .map((recipe) => `${recipe.recipeId} | ${recipe.title}`)
    .join("\n");
  const activeRecipe = args.activeRecipeId
    ? args.recipeMap.get(args.activeRecipeId)
    : null;
  const prompt = [
    "Your job is to help a user search their recipe catalog to find good recipes to recommend them. These recipes have been pinned by the user because they looked good or they have tried it already.",
    "Return JSON only.",
    "If you can't find a matching recipe or provide a recommendation, just say that you don't have anything to recommend",
    "If the user asks for a specific number of recipes, provide exactly that or less. If less, explain why.",
    "Do not invent recipe ids or recipes.",
    "Speak directly to the person as 'you'. Never call them 'the user'.",
    "If a recipe has below a three star rating, be hesitant to recommend it. Only speak about it if the recipe is specifically asked about, don't provide it in a list of general recommendations",
    "Use recipe ids from the current or selected recipes only when naming a recipe explicitly.",
    "When you mention a recipe inline inside assistantMessage, use the exact token format <recipe:RECIPE_ID|Recipe Name>.",
    "Only use the inline recipe token for recipes that exist in the selected/current set.",
    "When the user asks for the best rated, favorites, what they really like, or mentions reviews, use review averages and review note text heavily.",
    "Use reviewTerms for important phrases from review notes or review-focused requests.",
    "Set preferHighlyRated when the user asks for best rated, top rated, highest rated, or favorites.",
    "Set preferRecipesYouLike when the user asks for recipes they really like or repeatedly rate highly.",
    "Write assistantMessage as a short conversational reply that sounds like you are talking directly to them about these results.",
    "Write followUpQuestions as 2 to 4 short follow-up prompts they could tap next. If their request is broad, use the questions to narrow dish types, cooking style, or effort level.",
    "Use replace_set for rejection or reset language.",
    "Use refine_set for narrowing or steering within the current set.",
    "Use add_to_set for requests to keep the set and add more.",
    "",
    `User prompt: ${args.prompt}`,
    "",
    activeRecipe
      ? `Active recipe: ${activeRecipe.recipeId} | ${activeRecipe.title}`
      : "Active recipe: none",
    orderedCurrentRecipes
      ? `Current set:\n${orderedCurrentRecipes}`
      : "Current set: none",
    selectedRecipes
      ? `Recipes available for inline mention:\n${selectedRecipes}`
      : "Recipes available for inline mention: none",
    pinnedRecipes
      ? `Pinned recipes:\n${pinnedRecipes}`
      : "Pinned recipes: none",
    topRatedRecipes
      ? `Top reviewed household recipes:\n${topRatedRecipes}`
      : "Top reviewed household recipes: none",
  ].join("\n");

  const parsed = await generateRecipePickerWithHouseholdAi({
    householdId: args.householdId,
    prompt,
    schema: pickerAiSchema,
  });

  return parsed ? normalizeInterpretation(parsed) : null;
}

async function getRecipePickerRows(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  householdId: string,
) {
  return await db.query.householdRecipes
    .findMany({
      where: (table, { and, eq, isNull }) => and(
        eq(table.householdId, householdId),
        isNull(table.removedAt),
      ),
      with: {
        pin: {
          columns: {
            title: true,
            description: true,
            link: true,
            mediaJson: true,
            rawJson: true,
            updatedAt: true,
          },
        },
        recipeInstructions: {
          columns: {
            title: true,
            description: true,
            siteName: true,
            imageUrl: true,
            categoriesJson: true,
            keywordsJson: true,
            cuisine: true,
            prepTime: true,
            cookTime: true,
            totalTime: true,
          },
          with: {
            ingredients: {
              columns: {
                originalText: true,
                ingredientText: true,
                normalizedIngredientPhrase: true,
                canonicalIngredientId: true,
                attributesJson: true,
              },
              with: {
                canonicalIngredient: {
                  columns: {
                    displayName: true,
                  },
                },
              },
            },
          },
        },
        reviews: {
          columns: {
            ratingValue: true,
            note: true,
          },
        },
      },
    });
}

function buildRecipeCandidates(rows: RecipePickerRow[]): RecipeCandidate[] {
  return rows.map((row) => {
    const categories = parseJsonArray(row.recipeInstructions?.categoriesJson);
    const keywords = parseJsonArray(row.recipeInstructions?.keywordsJson);
    const ingredients = (row.recipeInstructions?.ingredients ?? []).map(
      (ingredient) => ({
        canonicalIngredientId: ingredient.canonicalIngredientId,
        canonicalName: ingredient.canonicalIngredient?.displayName ?? null,
        ingredientText: ingredient.ingredientText,
        originalText: ingredient.originalText,
        normalizedIngredientPhrase: ingredient.normalizedIngredientPhrase,
        attributes: parseJsonArray(ingredient.attributesJson),
      }),
    );
    const title =
      row.title ??
      row.recipeInstructions?.title ??
      row.pin.title ??
      "Untitled recipe";
    const shortDescription =
      row.description ??
      row.recipeInstructions?.description ??
      row.pin.description ??
      null;
    const imageSources = resolveRecipeImageSources(
      row.imageUrl,
      row.recipeInstructions?.imageUrl,
      row.pin.mediaJson,
      row.pin.rawJson,
    );
    const aggregate = getRecipeReviewAggregate(row.reviews);
    const reviewNotes = row.reviews
      .map((review) => review.note?.trim() ?? "")
      .filter(Boolean);
    const searchParts = [
      title,
      row.pin.title,
      shortDescription,
      row.pin.description,
      row.recipeInstructions?.siteName,
      row.recipeInstructions?.cuisine,
      row.pin.link,
      categories.join(" "),
      keywords.join(" "),
      ingredients
        .map((ingredient) =>
          [
            ingredient.canonicalName,
            ingredient.ingredientText,
            ingredient.originalText,
            ingredient.attributes.join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" "),
      reviewNotes.join(" "),
    ].filter(Boolean);

    return {
      recipeId: row.recipeId,
      title,
      imageUrl: imageSources.imageUrl,
      previewImageUrl: imageSources.previewImageUrl,
      siteName: row.recipeInstructions?.siteName ?? null,
      shortDescription,
      averageRating: aggregate.averageRating,
      reviewCount: aggregate.reviewCount,
      reviewNotes,
      updatedAt: row.updatedAt,
      ingredients,
      categories,
      keywords,
      cuisine: row.recipeInstructions?.cuisine ?? null,
      timeText: [
        row.recipeInstructions?.prepTime,
        row.recipeInstructions?.cookTime,
        row.recipeInstructions?.totalTime,
      ]
        .filter(Boolean)
        .join(" "),
      searchText: searchParts.join(" ").toLowerCase(),
      matchText: searchParts.join(" ").toLowerCase(),
      reviewText: reviewNotes.join(" ").toLowerCase(),
      pinTitle: row.pin.title ?? null,
      score: 0,
      matchedReasons: [],
      isStrongMatch: false,
    };
  });
}

function normalizeRequest(request: RecipePickerRequest): RecipePickerRequest {
  return {
    mode: request.mode === "v2" ? "v2" : "v1",
    prompt: request.prompt.trim(),
    conversationId: request.conversationId?.trim() || null,
    currentSetRecipeIds: uniqueStrings(request.currentSetRecipeIds),
    pinnedRecipeIds: uniqueStrings(request.pinnedRecipeIds),
    activeRecipeId: request.activeRecipeId?.trim() || null,
  };
}

function normalizeInterpretation(
  raw: z.infer<typeof pickerAiSchema>,
): PickerInterpretation {
  return {
    intent: raw.intent,
    mustIncludeIngredients: uniqueStrings(raw.mustIncludeIngredients),
    mustExcludeIngredients: uniqueStrings(raw.mustExcludeIngredients),
    mealTypes: uniqueStrings(raw.mealTypes),
    titleTerms: uniqueStrings(raw.titleTerms),
    keywordTerms: uniqueStrings(raw.keywordTerms),
    cuisineTerms: uniqueStrings(raw.cuisineTerms),
    timeHint: raw.timeHint?.trim() || null,
    similarToLikedRecipeIds: uniqueStrings(raw.similarToLikedRecipeIds),
    similarToCurrentRecipeIds: uniqueStrings(raw.similarToCurrentRecipeIds),
    reviewTerms: uniqueStrings(raw.reviewTerms),
    preferHighlyRated: raw.preferHighlyRated,
    preferRecipesYouLike: raw.preferRecipesYouLike,
    assistantMessage: raw.assistantMessage.trim(),
    followUpQuestions: uniqueStrings(raw.followUpQuestions),
    explanation: raw.explanation.trim(),
  };
}

export function fallbackInterpretRecipePrompt(args: {
  prompt: string;
  currentSetRecipeIds: string[];
  pinnedRecipeIds: string[];
  activeRecipeId: string | null;
  recipeMap: Map<string, RecipeCandidate>;
}): PickerInterpretation {
  const prompt = args.prompt.trim().toLowerCase();

  if (!prompt) {
    return {
      intent: "replace_set",
      mustIncludeIngredients: [],
      mustExcludeIngredients: [],
      mealTypes: [],
      titleTerms: [],
      keywordTerms: [],
      cuisineTerms: [],
      timeHint: null,
      similarToLikedRecipeIds: [],
      similarToCurrentRecipeIds: args.activeRecipeId
        ? [args.activeRecipeId]
        : [],
      reviewTerms: [],
      preferHighlyRated: false,
      preferRecipesYouLike: false,
      assistantMessage:
        "Here are a few recipes you can start with from your saved collection.",
      followUpQuestions: [
        "Show me cozy pasta or skillet dishes",
        "I want something lighter with vegetables",
        "Give me quick dinners under 30 minutes",
      ],
      explanation:
        "Starting with a broad mix of recipes from your household collection.",
    };
  }

  const excludes = uniqueStrings([
    ...extractRegexMatches(prompt, /\bwithout ([a-z\s-]+)/g),
    ...extractRegexMatches(prompt, /\bno ([a-z\s-]+)/g),
  ]);
  const timeMatch = prompt.match(/(\d+)\s*(minute|min)\b/);
  const terms = prompt
    .split(/[^a-z0-9]+/g)
    .map((term) => term.trim())
    .filter(Boolean);
  const multiWordTerms = [
    ...[
      ...FALLBACK_MEAL_TYPES,
      ...FALLBACK_KEYWORDS,
      ...FALLBACK_CUISINES,
    ].filter((term) => prompt.includes(term)),
  ];
  const mealTypes = multiWordTerms.filter((term) =>
    FALLBACK_MEAL_TYPES.has(term),
  );
  const keywordTerms = multiWordTerms.filter((term) =>
    FALLBACK_KEYWORDS.has(term),
  );
  const cuisineTerms = multiWordTerms.filter((term) =>
    FALLBACK_CUISINES.has(term),
  );

  const intent: RecipePickerIntent =
    /\b(add|also|another|more)\b/.test(prompt) && /\bkeep\b/.test(prompt)
      ? "add_to_set"
      : /\b(add|also|another|more like)\b/.test(prompt)
        ? "add_to_set"
        : /\b(no\b|don.t like|different|instead|replace|swap)\b/.test(prompt)
          ? "replace_set"
          : /\b(keep|narrow|only|less|lighter|fresh|crunchy)\b/.test(prompt)
            ? "refine_set"
            : "replace_set";

  const recipeTitleMatches = [...args.recipeMap.values()]
    .filter(
      (recipe) =>
        prompt.includes(recipe.title.toLowerCase()) ||
        (recipe.pinTitle && prompt.includes(recipe.pinTitle.toLowerCase())),
    )
    .map((recipe) => recipe.recipeId);
  const reviewFocusedRecipeIds = [...args.recipeMap.values()]
    .filter((recipe) => recipe.reviewCount > 0)
    .filter((recipe) =>
      recipe.reviewNotes.some((note) => prompt.includes(note.toLowerCase())),
    )
    .map((recipe) => recipe.recipeId);
  const ingredientCandidates = terms.filter(
    (term) => !STOP_WORDS.has(term) && term.length > 2,
  );
  const titleTerms = ingredientCandidates.filter((term) =>
    /\b(chow|mein|pasta|cookie|salad|fajita|orzo)\b/.test(term),
  );
  const preferHighlyRated =
    /\b(best rated|top rated|highest rated|best-reviewed|most loved|favorite|favorites)\b/.test(
      prompt,
    );
  const preferRecipesYouLike =
    /\b(really like|i like|we like|love|favorites?|go-to|go to)\b/.test(prompt);
  const reviewTerms = uniqueStrings(
    ingredientCandidates
      .filter((term) => !titleTerms.includes(term))
      .filter((term) =>
        /\b(review|reviews|rated|rating|favorite|favorites|love|loved|crispy|creamy|spicy|tender|juicy|saucy|comfort)\b/.test(
          term,
        ),
      ),
  );
  const mustIncludeIngredients = ingredientCandidates.filter(
    (term) =>
      !titleTerms.includes(term) &&
      !mealTypes.includes(term) &&
      !keywordTerms.includes(term) &&
      !cuisineTerms.includes(term) &&
      !reviewTerms.includes(term),
  );

  return {
    intent,
    mustIncludeIngredients: uniqueStrings(mustIncludeIngredients),
    mustExcludeIngredients: excludes,
    mealTypes: uniqueStrings(mealTypes),
    titleTerms: uniqueStrings(titleTerms),
    keywordTerms: uniqueStrings(keywordTerms),
    cuisineTerms: uniqueStrings(cuisineTerms),
    timeHint: timeMatch ? `${timeMatch[1]} minutes` : null,
    similarToLikedRecipeIds: uniqueStrings(args.pinnedRecipeIds),
    similarToCurrentRecipeIds: uniqueStrings([
      ...recipeTitleMatches,
      ...reviewFocusedRecipeIds,
      ...(args.activeRecipeId ? [args.activeRecipeId] : []),
    ]),
    reviewTerms,
    preferHighlyRated,
    preferRecipesYouLike,
    assistantMessage: buildFallbackAssistantMessage({
      prompt,
      preferHighlyRated,
      preferRecipesYouLike,
      reviewTerms,
    }),
    followUpQuestions: buildFallbackFollowUpQuestions({
      prompt,
      mustIncludeIngredients,
      mealTypes,
      cuisineTerms,
      keywordTerms,
      reviewTerms,
      preferHighlyRated,
      preferRecipesYouLike,
    }),
    explanation:
      preferHighlyRated || preferRecipesYouLike || reviewTerms.length > 0
        ? "Using your household ratings and review notes alongside recipe details to steer the carousel."
        : "Using title, ingredient, and keyword matches from your saved recipes to steer the carousel.",
  };
}

function scoreRecipeCandidate(
  recipe: RecipeCandidate,
  context: ScoreContext,
): RecipeCandidate {
  const reasons: string[] = [];
  let score = recipe.reviewCount * 0.4 + (recipe.averageRating ?? 0) * 0.35;

  if (
    context.interpretation.preferHighlyRated ||
    context.interpretation.preferRecipesYouLike
  ) {
    score += getReviewPreferenceBoost(recipe);
    if (recipe.reviewCount > 0 && recipe.averageRating !== null) {
      reasons.push(
        `Rated ${recipe.averageRating.toFixed(1)} stars by your household`,
      );
    }
  }

  for (const resolution of context.includeIngredientResolutions) {
    const match = findIngredientResolutionMatch(recipe, resolution);
    if (match.score > 0) {
      score += match.score;
      reasons.push(match.reason);
    }
  }

  for (const term of context.interpretation.mustIncludeIngredients) {
    if (termMatches(recipe.matchText, term)) {
      score += 3;
      reasons.push(`Includes ${term}`);
    }
  }

  for (const term of context.interpretation.mealTypes) {
    if (termMatches(recipe.matchText, term)) {
      score += 3.5;
      reasons.push(`Fits ${term}`);
    }
  }

  for (const term of context.interpretation.keywordTerms) {
    if (termMatches(recipe.matchText, term)) {
      score += 2.5;
      reasons.push(`Matches ${term}`);
    }
  }

  for (const term of context.interpretation.titleTerms) {
    if (
      termMatches(recipe.title.toLowerCase(), term) ||
      (recipe.pinTitle && termMatches(recipe.pinTitle.toLowerCase(), term))
    ) {
      score += 5;
      reasons.push(`Title matches ${term}`);
    } else if (termMatches(recipe.matchText, term)) {
      score += 2;
      reasons.push(`Mentions ${term}`);
    }
  }

  for (const term of context.interpretation.cuisineTerms) {
    if (termMatches(recipe.cuisine?.toLowerCase() ?? "", term)) {
      score += 3;
      reasons.push(`${term} cuisine`);
    }
  }

  for (const term of context.interpretation.reviewTerms) {
    if (termMatches(recipe.reviewText, term)) {
      score += 4;
      reasons.push(`Reviews mention ${term}`);
    }
  }

  if (
    context.interpretation.timeHint &&
    matchesTimeHint(recipe.timeText, context.interpretation.timeHint)
  ) {
    score += 2;
    reasons.push(`Closer to ${context.interpretation.timeHint}`);
  }

  const similarIds = uniqueStrings([
    ...context.interpretation.similarToLikedRecipeIds,
    ...context.interpretation.similarToCurrentRecipeIds,
  ]);
  if (similarIds.length > 0) {
    for (const similarRecipeId of similarIds) {
      const similarRecipe = context.recipeMap.get(similarRecipeId);
      if (!similarRecipe || similarRecipe.recipeId === recipe.recipeId) {
        continue;
      }

      const similarity = scoreRecipeSimilarity(recipe, similarRecipe);
      if (similarity > 0) {
        score += similarity;
        reasons.push(`Similar to ${similarRecipe.title}`);
      }
    }
  }

  if (context.pinnedRecipeIds.has(recipe.recipeId)) {
    score += 100;
    reasons.push("Pinned in this session");
  }

  if (
    context.currentSetRecipeIds.includes(recipe.recipeId) &&
    context.interpretation.intent !== "replace_set"
  ) {
    score += 1.5;
  }

  const isStrongMatch = score >= 5 || reasons.length >= 2;

  return {
    ...recipe,
    score,
    matchedReasons: uniqueStrings(reasons).slice(0, 3),
    isStrongMatch,
  };
}

function isExcludedRecipe(recipe: RecipeCandidate, context: ScoreContext) {
  for (const resolution of context.excludeIngredientResolutions) {
    const match = findIngredientResolutionMatch(recipe, resolution);
    if (match.score > 0) {
      return true;
    }
  }

  for (const term of context.interpretation.mustExcludeIngredients) {
    if (termMatches(recipe.matchText, term)) {
      return true;
    }
  }

  return false;
}

function buildRecipePickerSet(args: {
  candidates: RecipeCandidate[];
  currentSetRecipeIds: string[];
  pinnedRecipeIds: string[];
  intent: RecipePickerIntent;
}) {
  const candidateMap = new Map(
    args.candidates.map((recipe) => [recipe.recipeId, recipe]),
  );
  const pinned = args.pinnedRecipeIds
    .map((recipeId) => candidateMap.get(recipeId))
    .filter((value): value is RecipeCandidate => Boolean(value));
  const pinnedIds = new Set(pinned.map((recipe) => recipe.recipeId));
  const selected: RecipeCandidate[] = [...pinned];

  if (args.intent === "add_to_set") {
    for (const recipeId of args.currentSetRecipeIds) {
      const recipe = candidateMap.get(recipeId);
      if (
        recipe &&
        !pinnedIds.has(recipe.recipeId) &&
        selected.length < TARGET_SET_SIZE
      ) {
        selected.push(recipe);
      }
    }
  }

  if (args.intent === "refine_set") {
    const existingRanked = args.currentSetRecipeIds
      .map((recipeId) => candidateMap.get(recipeId))
      .filter((value): value is RecipeCandidate => Boolean(value))
      .filter(
        (recipe) =>
          !selected.some((entry) => entry.recipeId === recipe.recipeId),
      )
      .sort(compareRankedRecipes);
    for (const recipe of existingRanked) {
      if (
        (recipe.isStrongMatch || selected.length < MIN_SET_SIZE) &&
        selected.length < TARGET_SET_SIZE
      ) {
        selected.push(recipe);
      }
    }
  }

  for (const recipe of args.candidates) {
    if (selected.some((entry) => entry.recipeId === recipe.recipeId)) {
      continue;
    }

    if (selected.length >= TARGET_SET_SIZE) {
      break;
    }

    if (recipe.isStrongMatch || selected.length < MIN_SET_SIZE) {
      selected.push(recipe);
    }
  }

  return selected.slice(0, TARGET_SET_SIZE);
}

function buildSetExplanation(args: {
  interpretation: PickerInterpretation;
  request: RecipePickerRequest;
  requiresAiSetup: boolean;
  selected: RecipeCandidate[];
}) {
  if (args.request.mode === "v2") {
    return "V2 chat mode is coming soon. Using the structured V1 picker for now.";
  }

  if (args.requiresAiSetup) {
    return args.request.prompt
      ? "Connect the household AI in settings to turn prompts into recipe picks. Showing a best-effort recipe mix for now."
      : "Connect the household AI in settings to start prompting for recipe picks. Showing a starter carousel from your saved recipes.";
  }

  if (args.request.prompt.trim().length === 0) {
    return "Starting with a broad mix of recipes from your household collection.";
  }

  if (args.selected.length < MIN_SET_SIZE) {
    return `${args.interpretation.explanation} Only a few strong matches were found, so broader nearby recipes are included too.`;
  }

  return args.interpretation.explanation;
}

function buildAssistantMessage(args: {
  interpretation: PickerInterpretation;
  request: RecipePickerRequest;
  requiresAiSetup: boolean;
  selected: RecipeCandidate[];
  recipeCards: RecipePickerCard[];
}) {
  if (args.request.mode === "v2") {
    return "I’m still using the structured picker here, but I can keep narrowing the set with follow-up prompts.";
  }

  if (args.requiresAiSetup) {
    return args.request.prompt
      ? "Connect your household AI in settings and I can respond more conversationally. For now, I pulled together a best-effort set from your saved recipes."
      : "Connect your household AI in settings and I can guide you with follow-up questions. For now, here’s a starter mix from your saved recipes.";
  }

  if (args.request.prompt.trim().length === 0) {
    return "Here’s a starting mix from your saved recipes. If you want, I can narrow it down by dish type, ingredient, time, or mood.";
  }

  if (args.selected.length === 0) {
    return "I couldn’t find many direct matches, so I’d love one more detail to narrow this down for you.";
  }

  const referenced = args.recipeCards
    .slice(0, Math.min(2, args.recipeCards.length))
    .map((recipe) => `<recipe:${recipe.recipeId}|${recipe.title}>`);
  const referenceText =
    referenced.length > 0 ? ` I’d start with ${referenced.join(" and ")}.` : "";

  if (args.selected.length < MIN_SET_SIZE) {
    return `${args.interpretation.assistantMessage}${referenceText} I only found a few strong matches, so I mixed in some nearby options too.`;
  }

  const normalizedMessage =
    args.interpretation.assistantMessage ||
    "I pulled together a set that fits what you asked for.";
  return normalizedMessage.includes("<recipe:")
    ? normalizedMessage
    : `${normalizedMessage}${referenceText}`;
}

function buildSuggestedPrompts(args: {
  interpretation: PickerInterpretation;
  request: RecipePickerRequest;
  selected: RecipeCandidate[];
  requiresAiSetup: boolean;
}) {
  if (args.requiresAiSetup) {
    return [
      "Show me quick dinners under 30 minutes",
      "I want a cozy pasta or skillet meal",
      "Give me something lighter with chicken",
    ];
  }

  return uniqueStrings(args.interpretation.followUpQuestions ?? []).slice(0, 4);
}

function resolveActiveIndex(
  selected: RecipeCandidate[],
  activeRecipeId: string | null | undefined,
) {
  if (!activeRecipeId) {
    return 0;
  }

  const index = selected.findIndex(
    (recipe) => recipe.recipeId === activeRecipeId,
  );
  return index >= 0 ? index : 0;
}

function resolveActiveIndexFromCards(
  selected: RecipePickerCard[],
  activeRecipeId: string | null | undefined,
) {
  if (!activeRecipeId) {
    return 0;
  }

  const index = selected.findIndex(
    (recipe) => recipe.recipeId === activeRecipeId,
  );
  return index >= 0 ? index : 0;
}

function toRecipePickerCard(
  recipe: RecipeCandidate,
  pinnedRecipeIds: string[],
): RecipePickerCard {
  return {
    recipeId: recipe.recipeId,
    title: recipe.title,
    imageUrl: recipe.imageUrl,
    previewImageUrl: recipe.previewImageUrl,
    siteName: recipe.siteName,
    shortDescription: recipe.shortDescription,
    matchedReasons:
      recipe.matchedReasons.length > 0
        ? recipe.matchedReasons
        : ["Broader match from your saved recipes"],
    isPinned: pinnedRecipeIds.includes(recipe.recipeId),
    averageRating: recipe.averageRating,
    reviewCount: recipe.reviewCount,
  };
}

function toChatMessage(
  message: ConversationMessageRow,
): RecipePickerChatMessage {
  const inlineRecipeRefs = safeParseJson<RecipePickerInlineRecipeRef[]>(
    message.inlineRecipeRefsJson,
    [],
  );
  const parsedMessage = parseStoredInlineRecipeReferences(
    message.bodyText,
    inlineRecipeRefs,
  );

  return {
    messageId: message.messageId,
    role: message.role as RecipePickerChatMessage["role"],
    bodyText: message.bodyText,
    intent: (message.intent as RecipePickerIntent | null) ?? null,
    createdAt: message.createdAt,
    inlineRecipeRefs,
    segments: parsedMessage.segments,
    recipeSnapshot: safeParseJson<RecipePickerCard[] | null>(
      message.recipeSnapshotJson,
      null,
    ),
    pinnedRecipeIds: safeParseJson<string[]>(message.pinnedRecipeIdsJson, []),
    activeRecipeId: message.activeRecipeId ?? null,
    suggestedPrompts: safeParseJson<string[]>(message.suggestedPromptsJson, []),
  };
}

function toConversationSummary(
  conversation: ConversationRow,
): RecipePickerConversationSummary {
  const lastMessage =
    conversation.messages[conversation.messages.length - 1] ?? null;
  const preview = lastMessage?.bodyText.trim() || "New chat";
  return {
    conversationId: conversation.conversationId,
    title: conversation.title?.trim() || "New chat",
    preview,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
  };
}

function deriveConversationTitle(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "New chat";
  }

  return trimmed.length <= 60
    ? trimmed
    : `${trimmed.slice(0, 57).trimEnd()}...`;
}

function parseInlineRecipeReferences(
  bodyText: string,
  allowedRecipes: Map<string, { title: string }>,
): ParsedInlineRecipeMessage {
  const regex = /<recipe:([^|>]+)\|([^>]+)>/g;
  const inlineRecipeRefs: RecipePickerInlineRecipeRef[] = [];
  const segments: RecipePickerMessageSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(bodyText)) !== null) {
    const [raw, recipeId, label] = match;
    if (match.index > cursor) {
      segments.push({
        type: "text",
        text: bodyText.slice(cursor, match.index),
      });
    }

    if (allowedRecipes.has(recipeId)) {
      inlineRecipeRefs.push({ recipeId, label });
      segments.push({ type: "recipe", recipeId, label });
    } else {
      segments.push({ type: "text", text: raw });
    }

    cursor = match.index + raw.length;
  }

  if (cursor < bodyText.length) {
    segments.push({ type: "text", text: bodyText.slice(cursor) });
  }

  return {
    inlineRecipeRefs,
    segments: mergeTextSegments(segments),
  };
}

function parseStoredInlineRecipeReferences(
  bodyText: string,
  storedRefs: RecipePickerInlineRecipeRef[],
): ParsedInlineRecipeMessage {
  const allowedLabels = new Map(
    storedRefs.map((ref) => [`${ref.recipeId}|${ref.label}`, ref]),
  );
  const regex = /<recipe:([^|>]+)\|([^>]+)>/g;
  const segments: RecipePickerMessageSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(bodyText)) !== null) {
    const [raw, recipeId, label] = match;
    if (match.index > cursor) {
      segments.push({
        type: "text",
        text: bodyText.slice(cursor, match.index),
      });
    }

    const stored = allowedLabels.get(`${recipeId}|${label}`);
    if (stored) {
      segments.push({
        type: "recipe",
        recipeId: stored.recipeId,
        label: stored.label,
      });
    } else {
      segments.push({ type: "text", text: raw });
    }

    cursor = match.index + raw.length;
  }

  if (cursor < bodyText.length) {
    segments.push({ type: "text", text: bodyText.slice(cursor) });
  }

  return {
    inlineRecipeRefs: storedRefs,
    segments: mergeTextSegments(segments),
  };
}

function mergeTextSegments(segments: RecipePickerMessageSegment[]) {
  return segments.reduce<RecipePickerMessageSegment[]>((acc, segment) => {
    const previous = acc[acc.length - 1];
    if (segment.type === "text" && previous?.type === "text") {
      previous.text += segment.text;
      return acc;
    }

    acc.push(segment);
    return acc;
  }, []);
}

function findIngredientResolutionMatch(
  recipe: RecipeCandidate,
  resolution: NonNullable<IngredientResolution>,
) {
  let bestScore = 0;
  let bestReason = `Includes ${resolution.canonicalDisplayName}`;

  for (const ingredient of recipe.ingredients) {
    if (
      !ingredient.canonicalIngredientId ||
      !resolution.searchCanonicalIngredientIds.includes(
        ingredient.canonicalIngredientId,
      )
    ) {
      continue;
    }

    const attributeMatch = resolution.attributes.every((attribute) =>
      ingredient.attributes.includes(attribute),
    );
    const score =
      ingredient.canonicalIngredientId === resolution.canonicalIngredientId
        ? attributeMatch || resolution.attributes.length === 0
          ? 6
          : 4
        : attributeMatch || resolution.attributes.length === 0
          ? 4
          : 2;

    if (score > bestScore) {
      bestScore = score;
      bestReason =
        resolution.attributes.length > 0
          ? `Includes ${resolution.attributes.join(" ")} ${resolution.canonicalDisplayName}`
          : `Includes ${resolution.canonicalDisplayName}`;
    }
  }

  return {
    score: bestScore,
    reason: bestReason,
  };
}

function matchesTimeHint(timeText: string, timeHint: string) {
  const recipeMinutes = extractMinutes(timeText);
  const requestedMinutes = extractMinutes(timeHint);

  if (!recipeMinutes || !requestedMinutes) {
    return normalizeIngredientKey(timeText).includes(
      normalizeIngredientKey(timeHint),
    );
  }

  return (
    Math.abs(recipeMinutes - requestedMinutes) <= 15 ||
    recipeMinutes <= requestedMinutes + 10
  );
}

function extractMinutes(value: string) {
  const match = value.match(/(\d+)/);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function scoreRecipeSimilarity(left: RecipeCandidate, right: RecipeCandidate) {
  const leftTerms = new Set(tokenizeSimilarityText(left));
  const rightTerms = new Set(tokenizeSimilarityText(right));
  const shared = [...leftTerms].filter((term) => rightTerms.has(term));

  if (shared.length === 0) {
    return 0;
  }

  return Math.min(5, shared.length * 0.9);
}

function tokenizeSimilarityText(recipe: RecipeCandidate) {
  return [
    recipe.title,
    recipe.shortDescription ?? "",
    recipe.categories.join(" "),
    recipe.keywords.join(" "),
    recipe.cuisine ?? "",
    recipe.ingredients
      .map(
        (ingredient) =>
          ingredient.canonicalName ??
          ingredient.ingredientText ??
          ingredient.originalText,
      )
      .join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function compareRankedRecipes(left: RecipeCandidate, right: RecipeCandidate) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.reviewCount !== left.reviewCount) {
    return right.reviewCount - left.reviewCount;
  }

  if ((right.averageRating ?? 0) !== (left.averageRating ?? 0)) {
    return (right.averageRating ?? 0) - (left.averageRating ?? 0);
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function getRecipeReviewAggregate(reviews: Array<{ ratingValue: number }>) {
  if (reviews.length === 0) {
    return {
      averageRating: null,
      reviewCount: 0,
    };
  }

  const total = reviews.reduce((sum, review) => sum + review.ratingValue, 0);
  return {
    averageRating: Number((total / reviews.length).toFixed(1)),
    reviewCount: reviews.length,
  };
}

function extractRegexMatches(value: string, expression: RegExp) {
  return [...value.matchAll(expression)]
    .map((match) => match[1]?.trim())
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => entry.split(/\b(?:and|or)\b/g).map((part) => part.trim()))
    .flat()
    .filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function termMatches(text: string, term: string) {
  return text.includes(term);
}

function getReviewPreferenceBoost(recipe: RecipeCandidate) {
  if (recipe.reviewCount === 0 || recipe.averageRating === null) {
    return 0;
  }

  return recipe.averageRating * 1.8 + Math.min(recipe.reviewCount, 5) * 0.8;
}

function compareRecipesByPreferenceSignal(
  left: RecipeCandidate,
  right: RecipeCandidate,
) {
  const ratingDelta = (right.averageRating ?? 0) - (left.averageRating ?? 0);
  if (ratingDelta !== 0) {
    return ratingDelta;
  }

  if (right.reviewCount !== left.reviewCount) {
    return right.reviewCount - left.reviewCount;
  }

  return 0;
}

function formatReviewSummary(recipe: RecipeCandidate) {
  if (recipe.reviewCount === 0 || recipe.averageRating === null) {
    return "No household reviews yet";
  }

  return `${recipe.averageRating.toFixed(1)} stars across ${recipe.reviewCount} review${recipe.reviewCount === 1 ? "" : "s"}`;
}

function trimForPrompt(value: string, limit: number) {
  return value.length <= limit
    ? value
    : `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const recipePickerTestUtils = {
  buildRecipePickerSet,
  buildFallbackFollowUpQuestions,
  fallbackInterpretRecipePrompt,
  isExcludedRecipe,
  parseInlineRecipeReferences,
  scoreRecipeCandidate,
};

function buildFallbackAssistantMessage(args: {
  prompt: string;
  preferHighlyRated: boolean;
  preferRecipesYouLike: boolean;
  reviewTerms: string[];
}) {
  if (args.preferHighlyRated || args.preferRecipesYouLike) {
    return "I’m leaning on your household ratings and reviews here, so these should feel closer to the recipes you already love.";
  }

  if (args.reviewTerms.length > 0) {
    return `I used your review notes to look for recipes that match details like ${args.reviewTerms.join(", ")}.`;
  }

  if (isGeneralPrompt(args.prompt)) {
    return "I pulled together a broad mix to get started. I can narrow it down fast if you tell me what kind of dish sounds good.";
  }

  return "I matched these recipes to the details you gave me and can keep narrowing from here.";
}

function buildFallbackFollowUpQuestions(args: {
  prompt: string;
  mustIncludeIngredients: string[];
  mealTypes: string[];
  cuisineTerms: string[];
  keywordTerms: string[];
  reviewTerms: string[];
  preferHighlyRated: boolean;
  preferRecipesYouLike: boolean;
}) {
  if (isGeneralPrompt(args.prompt)) {
    return [
      "Do you want pasta, soup, salad, bowls, or sandwiches?",
      "Should this feel cozy, fresh, creamy, or spicy?",
      "Do you want something quick for a weeknight or a slower weekend recipe?",
      "Would you rather see chicken, seafood, vegetarian, or beef dishes?",
    ];
  }

  if (args.preferHighlyRated || args.preferRecipesYouLike) {
    return [
      "Show me the best rated ones that are quicker",
      "Narrow this to chicken dishes",
      "Only show the coziest comfort-food options",
      "Find the ones with the strongest review notes",
    ];
  }

  if (args.mustIncludeIngredients.length > 0) {
    const ingredient = args.mustIncludeIngredients[0];
    return [
      `Show me lighter ${ingredient} dishes`,
      `Give me the best rated recipes with ${ingredient}`,
      `I want a cozy ${ingredient} dinner`,
      `Keep ${ingredient} but make it faster`,
    ];
  }

  if (
    args.mealTypes.length > 0 ||
    args.cuisineTerms.length > 0 ||
    args.keywordTerms.length > 0 ||
    args.reviewTerms.length > 0
  ) {
    return [
      "Make this quicker for a weeknight",
      "Show me the best rated options in this group",
      "Keep this vibe but make it lighter",
      "Find something similar with chicken",
    ];
  }

  return [
    "Show me the best rated recipes here",
    "I want something lighter",
    "Give me a cozy dinner option",
    "Make it quicker for a weeknight",
  ];
}

function isGeneralPrompt(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return true;
  }

  const normalized = trimmed.toLowerCase();
  return (
    normalized.split(/\s+/).length <= 4 &&
    !/\b(chicken|beef|pork|shrimp|salad|pasta|soup|taco|bowl|sandwich|curry|noodle|dessert|breakfast|lunch|dinner)\b/.test(
      normalized,
    )
  );
}
