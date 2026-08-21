import { auth, clerkClient } from "@clerk/nextjs/server";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { getCurrentUserAccess, resolveFeedCardHref } from "@/lib/server/access";
import {
  listHouseholdMembers,
  requireHouseholdContext,
} from "@/lib/server/auth";
import { openDatabase } from "@/lib/server/database";
import {
  boardSyncSubscriptions,
  householdBoards,
  householdAlwaysHaveIngredients,
  householdCanonicalIngredients,
  householdIngredientAliases,
  householdInvites,
  householdRecipeParseJobItems,
  householdRecipeParseJobs,
  householdRecipeIngredients,
  householdRecipeEvents,
  householdRecipeInstructions,
  householdRecipeReviews,
  householdRecipeVersions,
  householdShoppingCarts,
  householdShoppingCartItemStates,
  pinterestAccounts,
  recipeFolderMemberships,
  recipeFolders,
  recipeTags,
} from "@/lib/server/db";
import {
  getCanonicalIngredientOptionsForHousehold,
  normalizeIngredientKey,
  resolveIngredientSearchQuery,
} from "@/lib/server/ingredient-normalization";
import { getPinImageSources, getPinImageUrl } from "@/lib/server/media";
import { listRemotePinterestBoards } from "@/lib/server/pinterest";
import { buildShoppingCartItems } from "@/lib/shopping-cart";
import { summarizeRecipeOps } from "@/lib/server/recipe-ops-summary";
import { derivePinStatus } from "@/lib/server/status";
import { resolveRecipeImageSources } from "@/lib/recipe-image-sources";
import {
  buildCalendarDays,
  expandDayRange,
  formatDay,
  formatMonthLabel,
  getTodayDayString,
  getTodayMonthString,
  isValidMonthString,
  isValidDayString,
  parseJsonArray,
  parseJsonRecord,
  shiftMonth,
} from "@/lib/utils";
import type {
  BoardSyncSummary,
  CanonicalIngredientOption,
  DashboardSummary,
  FeedPinCard,
  FeedPinsPage,
  FeedSearchMatch,
  HouseholdMemberView,
  IngredientReviewItemView,
  IngredientReviewQueuePageView,
  IngredientCatalogPageView,
  IngredientReviewSuggestionView,
  RecipeDetailView,
  RecipeFolderTreeNode,
  RecipeHistoryDayView,
  RecipeHistoryEventView,
  RecipeHistoryPageView,
  RecipeHistoryRecipeOption,
  RecipeOpsDetail,
  RecipeOpsListItem,
  RecipeParseJobDetail,
  RecipeParseJobSummary,
  PublicRecipeDetailView,
  PublicRecipeVersionDetailView,
  RecipeReviewView,
  RecipeTagCollectionView,
  RecipeTagView,
  RecipeVersionView,
  ShoppingCartPageView,
} from "@/types/view-models";

type DatabaseHandle = Awaited<ReturnType<typeof openDatabase>>["db"];
type RecipeGraph = Awaited<ReturnType<typeof getFeedRecipeRows>>[number];
type FeedCardRow = FeedPinCard & {
  searchMatchTier: number;
  pin: RecipeGraph["pin"];
  updatedAt: string;
};

const DEFAULT_FEED_PAGE_SIZE = 50;
const MAX_FEED_PAGE_SIZE = 100;
const PINTEREST_FOLDER_SOURCE = "pinterest";

export async function getFeedPins(searchText?: string): Promise<FeedPinCard[]> {
  const [context, appAccess] = await Promise.all([
    requireHouseholdContext(),
    getCurrentUserAccess(),
  ]);
  const { db, sqlite } = await openDatabase();

  try {
    const rows = await getFeedRecipeRows(db, context.householdId);
    const cards = await prepareFeedCards({
      rows,
      householdId: context.householdId,
      db,
      searchText,
      subscriptionTier: appAccess.subscriptionTier,
    });

    return cards.map(({ updatedAt: _updatedAt, searchMatchTier: _tier, ...card }) => card);
  } finally {
    await sqlite.close();
  }
}

export async function getCustomRecipeBoardOptions() {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const [rows, connection] = await Promise.all([
      db.query.boardSyncSubscriptions.findMany({
      where: (table, { and, eq }) => and(
        eq(table.householdId, context.householdId),
        eq(table.syncEnabled, true),
      ),
      orderBy: (table, { asc }) => [asc(table.boardName)],
      }),
      db.query.pinterestAccounts.findFirst({
        where: (table, { and, eq }) => and(
          eq(table.householdId, context.householdId),
          eq(table.provider, "pinterest"),
          eq(table.connectionStatus, "active"),
        ),
        columns: { scope: true },
      }),
    ]);
    const scopes = new Set(connection?.scope?.split(",").map((scope) => scope.trim()) ?? []);
    return {
      canPublish: scopes.has("pins:write") && scopes.has("boards:read"),
      boards: rows.map((row) => ({
      boardId: row.pinterestBoardId,
      name: row.boardName || "Untitled Pinterest board",
      })),
    };
  } finally {
    await sqlite.close();
  }
}

export async function getFeedPinsPage({
  searchText,
  cursor,
  pageSize = DEFAULT_FEED_PAGE_SIZE,
  tagId,
}: {
  searchText?: string;
  cursor?: string | null;
  pageSize?: number;
  tagId?: string;
}): Promise<FeedPinsPage> {
  const [context, appAccess] = await Promise.all([
    requireHouseholdContext(),
    getCurrentUserAccess(),
  ]);
  const { db, sqlite } = await openDatabase();

  try {
    const rows = await getFeedRecipeRows(db, context.householdId, tagId);
    const cards = await prepareFeedCards({
      rows,
      householdId: context.householdId,
      db,
      searchText,
      subscriptionTier: appAccess.subscriptionTier,
    });
    const normalizedPageSize = Number.isInteger(pageSize)
      ? Math.min(Math.max(pageSize, 1), MAX_FEED_PAGE_SIZE)
      : DEFAULT_FEED_PAGE_SIZE;
    const decodedCursor = decodeFeedCursor(cursor);
    const exactCursorIndex = decodedCursor
      ? cards.findIndex((card) => matchesCursor(card, decodedCursor))
      : -1;
    const startIndex = decodedCursor
      ? exactCursorIndex >= 0
        ? exactCursorIndex + 1
        : cards.findIndex((card) => isAfterCursor(card, decodedCursor))
      : 0;
    const safeStartIndex = startIndex > 0 ? startIndex : 0;
    const items = cards
      .slice(safeStartIndex, safeStartIndex + normalizedPageSize)
      .map(({ updatedAt, ...card }) => card);
    const nextItem = cards[safeStartIndex + normalizedPageSize];
    const lastVisibleItem =
      items.length > 0 ? cards[safeStartIndex + items.length - 1] : null;

    return {
      items,
      nextCursor:
        nextItem && lastVisibleItem ? encodeFeedCursor(lastVisibleItem) : null,
      hasMore: Boolean(nextItem),
    };
  } finally {
    await sqlite.close();
  }
}

export async function getRecipeDetail(
  recipeId: string,
): Promise<RecipeDetailView | null> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const row = await db.query.householdRecipes
      .findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.recipeId, recipeId),
            eq(table.householdId, context.householdId),
          ),
        with: {
          pin: {
            with: {
              recipeExtractions: {
                orderBy: (table, { desc: orderDesc }) => [
                  orderDesc(table.createdAt),
                ],
              },
            },
          },
          folderMemberships: {
            where: (table, { eq }) => eq(table.source, PINTEREST_FOLDER_SOURCE),
            with: {
              folder: {
                with: {
                  parentFolder: true,
                },
              },
            },
          },
          tagMemberships: {
            with: {
              tag: true,
            },
          },
          recipeInstructions: {
            with: {
              ingredients: {
                orderBy: (table, { asc }) => [asc(table.position)],
                with: {
                  canonicalIngredient: true,
                },
              },
              steps: {
                orderBy: (table, { asc }) => [asc(table.position)],
              },
            },
          },
          reviews: {
            orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
            with: {
              event: true,
            },
          },
        },
      });

    if (!row) {
      return null;
    }

    let versions = await db.query.householdRecipeVersions.findMany({
      where: (table, { and, eq }) => and(eq(table.recipeId, row.recipeId), eq(table.householdId, context.householdId)),
      orderBy: (table, { asc }) => [asc(table.versionNumber)],
    });
    if (versions.length === 0) {
      const imageSources = resolveRecipeImageSources(row.imageUrl, row.recipeInstructions?.imageUrl, row.pin.mediaJson, row.pin.rawJson);
      const snapshot = {
        title: row.title ?? row.pin.title ?? row.recipeInstructions?.title ?? "Untitled recipe",
        description: row.description ?? row.pin.description ?? row.recipeInstructions?.description ?? null,
        imageUrl: imageSources.imageUrl, sourceUrl: row.recipeInstructions?.canonicalUrl ?? row.pin.link,
        dominantColor: row.pin.dominantColor, yieldText: row.recipeInstructions?.yieldText ?? null,
        prepTime: row.recipeInstructions?.prepTime ?? null, cookTime: row.recipeInstructions?.cookTime ?? null, totalTime: row.recipeInstructions?.totalTime ?? null,
        ingredients: row.recipeInstructions?.ingredients.map((ingredient) => ({ id: ingredient.ingredientId, originalText: ingredient.originalText, displayText: ingredient.originalText, amount: ingredient.amountText, amountValue: ingredient.amountValue, amountMaxValue: ingredient.amountMaxValue, unit: ingredient.unit, parsedText: ingredient.ingredientText, notes: ingredient.notes, canonicalIngredientId: ingredient.canonicalIngredientId, canonicalName: ingredient.canonicalIngredient?.displayName ?? null, attributes: parseJsonArray(ingredient.attributesJson), normalizationStatus: toIngredientStatus(ingredient.normalizationStatus) })) ?? [],
        steps: row.recipeInstructions?.steps.map((step) => ({ id: step.stepId, section: step.section, text: step.text })) ?? [],
      };
      await db.insert(householdRecipeVersions).values({ householdId: context.householdId, recipeId: row.recipeId, versionNumber: 1, ingredientsJson: JSON.stringify(snapshot.ingredients.map((item) => item.originalText)), stepsJson: JSON.stringify(snapshot.steps), snapshotJson: JSON.stringify(snapshot), note: "Original recipe", createdAt: row.createdAt }).run();
      versions = [{ recipeVersionId: "", householdId: context.householdId, recipeId: row.recipeId, versionNumber: 1, ingredientsJson: JSON.stringify(snapshot.ingredients.map((item) => item.originalText)), stepsJson: JSON.stringify(snapshot.steps), snapshotJson: JSON.stringify(snapshot), note: "Original recipe", createdByClerkUserId: null, createdAt: row.createdAt }];
    }
    const primaryVersion = versions.at(-1) ?? null;
    const primaryIngredients = primaryVersion ? parseVersionIngredientLines(primaryVersion.ingredientsJson) : null;
    const latestExtraction = row.pin.recipeExtractions[0];
    const selectedExtraction = row.pin.recipeExtractions.find(
      (extraction) => extraction.selected && extraction.sourceId === row.recipeInstructions?.sourceId,
    ) ?? latestExtraction;
    const reviewerNames = await getReviewerNameMap(context.householdId);
    const reviews = row.reviews
      .map((review) => toRecipeReviewView(review, row, reviewerNames, context, versionNumberForReview(review.recipeVersionId, versions)))
      .sort(compareReviewsByDate);
    const aggregate = getRecipeReviewAggregate(row.reviews);
    const folderPath = buildRecipeFolderPath(row.folderMemberships[0]?.folder ?? null);
    const imageSources = resolveRecipeImageSources(
      row.imageUrl,
      row.recipeInstructions?.imageUrl,
      row.pin.mediaJson,
      row.pin.rawJson,
    );
    const status = derivePinStatus({
      hasRecipe: Boolean(row.recipeInstructions),
      latestExtractionStatus: latestExtraction?.status,
      latestExtractionLowConfidence: latestExtraction?.lowConfidence,
      ingredientReviewCount: getIngredientReviewCount(row.recipeInstructions?.ingredients),
    });
    const statusSummary = summarizeRecipeOps({
      status,
      hasRecipeContent: Boolean(row.recipeInstructions),
      latestExtractionStatus: latestExtraction?.status ?? null,
      latestFailureReason: latestExtraction?.failureReason ?? null,
      latestLowConfidence: latestExtraction?.lowConfidence ?? false,
      ingredientReviewCount: getIngredientReviewCount(row.recipeInstructions?.ingredients),
      latestWarnings: parseJsonArray(latestExtraction?.warningsJson),
    });
    return {
      recipeId: row.recipeId,
      tags: row.tagMemberships
        .map((membership) => ({ tagId: membership.tag.tagId, name: membership.tag.name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      folderPath,
      pin: row.pin,
      title:
        row.title ??
        row.pin.title ??
        row.recipeInstructions?.title ??
        "Untitled recipe",
      imageUrl: imageSources.imageUrl,
      previewImageUrl: imageSources.previewImageUrl,
      description:
        row.description ??
        row.pin.description ??
        row.recipeInstructions?.description ??
        null,
      siteName: row.recipeInstructions?.siteName ?? null,
      sourceUrl: row.recipeInstructions?.canonicalUrl ?? row.pin.link,
      status,
      isFlagged: row.isFlagged,
      dominantColor: row.pin.dominantColor,
      yieldText: row.recipeInstructions?.yieldText ?? null,
      prepTime: row.recipeInstructions?.prepTime ?? null,
      cookTime: row.recipeInstructions?.cookTime ?? null,
      totalTime: row.recipeInstructions?.totalTime ?? null,
      averageRating: aggregate.averageRating,
      reviewCount: aggregate.reviewCount,
      reviews,
      primaryVersionNumber: primaryVersion?.versionNumber ?? 1,
      versions: toRecipeVersionViews(versions, row.recipeInstructions?.ingredients.map((ingredient) => ingredient.originalText) ?? []),
      ingredients:
        row.recipeInstructions?.ingredients.map((ingredient, index) => ({
          id: ingredient.ingredientId,
          originalText: primaryIngredients?.[index] ?? ingredient.originalText,
          displayText: primaryIngredients?.[index] ?? ingredient.originalText,
          amount: ingredient.amountText,
          amountValue: ingredient.amountValue,
          amountMaxValue: ingredient.amountMaxValue,
          unit: ingredient.unit,
          parsedText: ingredient.ingredientText,
          notes: ingredient.notes,
          canonicalIngredientId: ingredient.canonicalIngredientId,
          canonicalName: ingredient.canonicalIngredient?.displayName ?? null,
          attributes: parseJsonArray(ingredient.attributesJson),
          normalizationStatus: toIngredientStatus(
            ingredient.normalizationStatus,
          ),
        })) ?? [],
      steps:
        row.recipeInstructions?.steps.map((step) => ({
          id: step.stepId,
          section: step.section,
          text: step.text,
        })) ?? [],
      extractionProvenance:
        selectedExtraction?.contentVariant === "pin_image_ocr"
          ? "image"
          : selectedExtraction?.contentVariant === "pinterest_video"
            ? "video"
            : null,
      extractionSummary: latestExtraction
        ? `${latestExtraction.status.replaceAll("_", " ")}${latestExtraction.method ? ` via ${latestExtraction.method}` : ""}`
        : null,
      statusSummary: statusSummary.plainLanguageStatus,
      statusReason: statusSummary.latestAttentionReason,
    };
  } finally {
    await sqlite.close();
  }
}

/**
 * Loads only the fields safe to show to anyone who knows a recipe's public URL.
 * Unlike getRecipeDetail, this deliberately does not resolve a household or load
 * reviews, folders, extraction state, or raw Pinterest records.
 */
export async function getPublicRecipeDetail(
  recipeId: string,
  versionNumber = 1,
): Promise<PublicRecipeVersionDetailView | null> {
  const { db, sqlite } = await openDatabase();

  try {
    const versions = await db.query.householdRecipeVersions.findMany({
      where: (table, { eq }) => eq(table.recipeId, recipeId),
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.versionNumber)],
    });
    const selected = versions.find((version) => version.versionNumber === versionNumber);
    if (!selected && versions.length === 0 && versionNumber === 1) {
      const row = await db.query.householdRecipes.findFirst({
        where: (table, { eq }) => eq(table.recipeId, recipeId),
        with: { pin: true, recipeInstructions: { with: { ingredients: { orderBy: (table, { asc }) => [asc(table.position)], with: { canonicalIngredient: true } }, steps: { orderBy: (table, { asc }) => [asc(table.position)] } } } },
      });
      if (!row) return null;
      const household = await db.query.households.findFirst({
        where: (table, { eq }) => eq(table.householdId, row.householdId),
        columns: { name: true },
      });
      const imageSources = resolveRecipeImageSources(row.imageUrl, row.recipeInstructions?.imageUrl, row.pin.mediaJson, row.pin.rawJson);
      return {
        recipeId: row.recipeId, title: row.title ?? row.pin.title ?? row.recipeInstructions?.title ?? "Untitled recipe", imageUrl: imageSources.imageUrl, previewImageUrl: imageSources.previewImageUrl,
        householdName: household?.name ?? "A Food Picker household",
        description: row.description ?? row.pin.description ?? row.recipeInstructions?.description ?? null, sourceUrl: row.recipeInstructions?.canonicalUrl ?? row.pin.link, dominantColor: row.pin.dominantColor,
        yieldText: row.recipeInstructions?.yieldText ?? null, prepTime: row.recipeInstructions?.prepTime ?? null, cookTime: row.recipeInstructions?.cookTime ?? null, totalTime: row.recipeInstructions?.totalTime ?? null,
        ingredients: row.recipeInstructions?.ingredients.map((ingredient) => ({ id: ingredient.ingredientId, originalText: ingredient.originalText, displayText: ingredient.originalText, amount: ingredient.amountText, amountValue: ingredient.amountValue, amountMaxValue: ingredient.amountMaxValue, unit: ingredient.unit, parsedText: ingredient.ingredientText, notes: ingredient.notes, canonicalIngredientId: ingredient.canonicalIngredientId, canonicalName: ingredient.canonicalIngredient?.displayName ?? null, attributes: parseJsonArray(ingredient.attributesJson), normalizationStatus: toIngredientStatus(ingredient.normalizationStatus) })) ?? [],
        steps: row.recipeInstructions?.steps.map((step) => ({ id: step.stepId, section: step.section, text: step.text })) ?? [], versionNumber: 1, latestVersionNumber: 1,
      };
    }
    if (!selected) return null;
    const snapshot = parseJsonRecord(selected.snapshotJson) as PublicRecipeDetailView | null;
    if (!snapshot || typeof snapshot.title !== "string" || !Array.isArray(snapshot.ingredients) || !Array.isArray(snapshot.steps)) return null;
    const household = await db.query.households.findFirst({
      where: (table, { eq }) => eq(table.householdId, selected.householdId),
      columns: { name: true },
    });
    return { ...snapshot, recipeId, previewImageUrl: null, householdName: household?.name ?? "A Food Picker household", versionNumber: selected.versionNumber, latestVersionNumber: versions[0]?.versionNumber ?? selected.versionNumber };
  } finally {
    await sqlite.close();
  }
}

export async function getLatestPublicRecipeVersion(recipeId: string): Promise<number | null> {
  const { db, sqlite } = await openDatabase();
  try {
    const version = await db.query.householdRecipeVersions.findFirst({
      where: (table, { eq }) => eq(table.recipeId, recipeId),
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.versionNumber)],
      columns: { versionNumber: true },
    });
    if (version) return version.versionNumber;
    const recipe = await db.query.householdRecipes.findFirst({
      where: (table, { eq }) => eq(table.recipeId, recipeId),
      columns: { recipeId: true },
    });
    return recipe ? 1 : null;
  } finally { await sqlite.close(); }
}

/**
 * Checks access without provisioning a household, so public URLs remain safe
 * for visitors who are signed out or have not joined the recipe's household.
 */
export async function hasCurrentUserRecipeAccess(recipeId: string): Promise<boolean> {
  const { userId } = await auth();

  if (!userId) {
    return false;
  }

  const { db, sqlite } = await openDatabase();

  try {
    const membership = await db.query.householdMembers.findFirst({
      where: (table, { eq }) => eq(table.clerkUserId, userId),
      columns: { householdId: true },
    });

    if (!membership) {
      return false;
    }

    const recipe = await db.query.householdRecipes.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.recipeId, recipeId),
          eq(table.householdId, membership.householdId),
        ),
      columns: { recipeId: true },
    });

    return Boolean(recipe);
  } finally {
    await sqlite.close();
  }
}

type FolderPathRecord = {
  folderId: string;
  name: string | null;
  sourceType: string;
  parentFolder: {
    folderId: string;
    name: string | null;
    sourceType: string;
  } | null;
};

function buildRecipeFolderPath(folder: FolderPathRecord | null) {
  if (!folder) {
    return [];
  }

  const path: RecipeDetailView["folderPath"] = [
    {
      folderId: folder.folderId,
      name: folder.name,
      sourceType: folder.sourceType === "section" ? "section" : "board",
    },
  ];

  if (folder.parentFolder) {
    path.unshift({
      folderId: folder.parentFolder.folderId,
      name: folder.parentFolder.name,
      sourceType: folder.parentFolder.sourceType === "section" ? "section" : "board",
    });
  }

  return path;
}

export async function getPinterestRecipeFolderTree(): Promise<RecipeFolderTreeNode[]> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const [folders, membershipCounts] = await Promise.all([
      db.query.recipeFolders.findMany({
        where: (table, { and, eq }) =>
          and(
            eq(table.householdId, context.householdId),
            eq(table.source, PINTEREST_FOLDER_SOURCE),
        ),
        orderBy: (table, { asc }) => [asc(table.sourceType), asc(table.name)],
      }),
      db.query.recipeFolderMemberships.findMany({
        where: (table, { and, eq }) =>
          and(
            eq(table.householdId, context.householdId),
            eq(table.source, PINTEREST_FOLDER_SOURCE),
          ),
        columns: {
          folderId: true,
        },
      }),
    ]);

    const recipeCountByFolderId = new Map<string, number>();
    for (const membership of membershipCounts) {
      recipeCountByFolderId.set(
        membership.folderId,
        (recipeCountByFolderId.get(membership.folderId) ?? 0) + 1,
      );
    }
    const nodesById = new Map<string, RecipeFolderTreeNode>();

    for (const folder of folders) {
      nodesById.set(folder.folderId, {
        folderId: folder.folderId,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        sourceType: folder.sourceType === "section" ? "section" : "board",
        pinterestBoardId: folder.pinterestBoardId,
        pinterestSectionId: folder.pinterestSectionId,
        recipeCount: recipeCountByFolderId.get(folder.folderId) ?? 0,
        children: [],
      });
    }

    const roots: RecipeFolderTreeNode[] = [];

    for (const node of nodesById.values()) {
      if (node.parentFolderId) {
        const parent = nodesById.get(node.parentFolderId);
        if (parent) {
          parent.children.push(node);
          continue;
        }
      }

      roots.push(node);
    }

    for (const node of nodesById.values()) {
      node.children.sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""));
    }

    roots.sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""));
    return roots;
  } finally {
    await sqlite.close();
  }
}

export async function getRecipeHistoryPage(
  monthParam?: string,
  selectedRecipeId?: string,
): Promise<RecipeHistoryPageView> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();
  const month = isValidMonthString(monthParam ?? "")
    ? (monthParam as string)
    : getTodayMonthString();
  const nextMonth = shiftMonth(month, 1);

  try {
    const [eventRows, recipeRows, reviewerNames] = await Promise.all([
      db.query.householdRecipeEvents.findMany({
        where: (table, { and, eq, gte, lt }) =>
          and(
            eq(table.householdId, context.householdId),
            gte(table.date, buildMonthStart(month)),
            lt(table.date, buildMonthStart(nextMonth)),
          ),
        orderBy: (table, { asc: orderAsc }) => [
          orderAsc(table.date),
          orderAsc(table.createdAt),
        ],
        with: {
          recipe: {
            with: {
              pin: true,
              recipeInstructions: true,
            },
          },
          review: true,
        },
      }),
      db.query.householdRecipes.findMany({
        where: (table, { eq }) => eq(table.householdId, context.householdId),
        with: {
          pin: true,
          recipeInstructions: true,
          reviews: true,
        },
        orderBy: (table, { asc: orderAsc }) => [orderAsc(table.updatedAt)],
      }),
      getReviewerNameMap(context.householdId),
    ]);

    const recipeOptions = recipeRows
      .map((recipe) => {
        const imageSources = resolveRecipeImageSources(
          recipe.imageUrl,
          recipe.recipeInstructions?.imageUrl,
          recipe.pin.mediaJson,
          recipe.pin.rawJson,
        );
        const aggregate = getRecipeReviewAggregate(recipe.reviews);

        return {
          recipeId: recipe.recipeId,
          recipeTitle:
            recipe.title ??
            recipe.pin.title ??
            recipe.recipeInstructions?.title ??
            "Untitled recipe",
          recipeImageUrl: imageSources.imageUrl,
          recipePreviewImageUrl: imageSources.previewImageUrl,
          dominantColor: recipe.pin.dominantColor,
          averageRating: aggregate.averageRating,
          reviewCount: aggregate.reviewCount,
        } satisfies RecipeHistoryRecipeOption;
      })
      .sort((left, right) => left.recipeTitle.localeCompare(right.recipeTitle));
    const selectedRecipe =
      recipeOptions.find((recipe) => recipe.recipeId === selectedRecipeId) ??
      null;
    const eventsByDate = new Map<string, RecipeHistoryEventView[]>();

    for (const event of eventRows) {
      const eventView = toRecipeHistoryEventView(event, reviewerNames, context);
      const existing = eventsByDate.get(event.date) ?? [];
      existing.push(eventView);
      eventsByDate.set(event.date, existing);
    }

    const today = getTodayDayString();
    const days: RecipeHistoryDayView[] = buildCalendarDays(month).map((day) => ({
      date: day.date,
      dayNumber: day.dayNumber,
      inCurrentMonth: day.inCurrentMonth,
      isToday: day.date === today,
      isFuture: day.date > today,
      events: eventsByDate.get(day.date) ?? [],
    }));

    return {
      month,
      monthLabel: formatMonthLabel(month),
      previousMonth: shiftMonth(month, -1),
      nextMonth,
      days,
      recipeOptions,
      selectedRecipe,
    };
  } finally {
    await sqlite.close();
  }
}

export async function getShoppingCartPage(): Promise<ShoppingCartPageView> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const [activeCart, history, alwaysHaves] = await Promise.all([
      db.query.householdShoppingCarts.findFirst({
        where: (table, { and, eq: equals }) => and(equals(table.householdId, context.householdId), equals(table.status, "active")),
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.updatedAt)],
      }),
      db.query.householdShoppingCarts.findMany({
        where: (table, { and, eq: equals }) => and(equals(table.householdId, context.householdId), equals(table.status, "archived")),
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.updatedAt)],
        columns: { cartId: true, startDate: true, endDate: true, createdAt: true },
      }),
      db.query.householdAlwaysHaveIngredients.findMany({
        where: (table, { eq: equals }) => equals(table.householdId, context.householdId),
        with: { canonicalIngredient: true },
        orderBy: (table, { asc: orderAsc }) => [orderAsc(table.createdAt)],
      }),
    ]);
    const selectedDates = activeCart ? expandDayRange(activeCart.startDate, activeCart.endDate) : [];
    const [events, itemStates] = await Promise.all([
      selectedDates.length > 0
        ? db.query.householdRecipeEvents.findMany({
            where: (table, { and, eq: equals }) => and(equals(table.householdId, context.householdId), inArray(table.date, selectedDates)),
            orderBy: (table, { asc: orderAsc }) => [orderAsc(table.date), orderAsc(table.createdAt)],
            with: {
              recipe: {
                with: {
                  pin: true,
                  recipeInstructions: {
                    with: {
                      ingredients: {
                        orderBy: (table, { asc: orderAsc }) => [orderAsc(table.position)],
                        with: {
                          canonicalIngredient: true,
                          alternatives: {
                            orderBy: (table, { asc: orderAsc }) => [orderAsc(table.position)],
                            with: { canonicalIngredient: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      activeCart ? db.query.householdShoppingCartItemStates.findMany({ where: (table, { eq: equals }) => equals(table.cartId, activeCart.cartId) }) : Promise.resolve([]),
    ]);
    const sourceMeals = events.map((event) => ({
      eventId: event.eventId,
      date: event.date,
      recipeId: event.recipeId,
      recipeTitle: event.recipe.title ?? event.recipe.pin.title ?? event.recipe.recipeInstructions?.title ?? "Untitled recipe",
      recipeImageUrl: event.recipe.imageUrl ?? getPinImageUrl(event.recipe.pin.mediaJson, event.recipe.pin.rawJson),
    }));
    const allItems = buildShoppingCartItems(events.flatMap((event) => {
      const sourceMeal = sourceMeals.find((meal) => meal.eventId === event.eventId)!;
      return (event.recipe.recipeInstructions?.ingredients ?? []).map((ingredient) => ({
        ingredientId: ingredient.ingredientId,
        canonicalIngredientId: ingredient.canonicalIngredientId,
        canonicalName: ingredient.canonicalIngredient?.displayName ?? null,
        originalText: ingredient.originalText,
        ingredientText: ingredient.ingredientText,
        amountText: ingredient.amountText,
        amountValue: ingredient.amountValue,
        amountMaxValue: ingredient.amountMaxValue,
        unit: ingredient.unit,
        normalizationStatus: ingredient.normalizationStatus,
        alternatives: ingredient.alternatives.map((alternative) => ({
          alternativeId: alternative.alternativeId,
          ingredientText: alternative.ingredientText,
          canonicalIngredientId: alternative.canonicalIngredientId,
          canonicalName: alternative.canonicalIngredient?.displayName ?? null,
          normalizationStatus: alternative.normalizationStatus,
        })),
        sourceMeal,
      }));
    }));
    const enabledAlwaysHaveIds = new Set(alwaysHaves.filter((item) => item.enabled).map((item) => item.canonicalIngredientId));
    const stateByItemId = new Map(itemStates.map((item) => [item.itemId, item]));
    return {
      cartId: activeCart?.cartId ?? null,
      startDate: activeCart?.startDate ?? null,
      endDate: activeCart?.endDate ?? null,
      selectedDates,
      sourceMeals,
      items: allItems
        .filter((item) => item.alternativeOptions
          ? !item.alternativeOptions.some((option) => option.canonicalIngredientId && enabledAlwaysHaveIds.has(option.canonicalIngredientId))
          : !item.canonicalIngredientId || !enabledAlwaysHaveIds.has(item.canonicalIngredientId))
        .map((item, index) => {
          const state = stateByItemId.get(item.itemId);
          return { ...item, isAlwaysHave: item.canonicalIngredientId ? alwaysHaves.some((alwaysHave) => alwaysHave.canonicalIngredientId === item.canonicalIngredientId) : false, checked: state?.checked ?? false, sortPosition: state?.sortPosition ?? index };
        })
        .sort((left, right) => Number(left.checked) - Number(right.checked) || left.sortPosition - right.sortPosition || left.displayName.localeCompare(right.displayName)),
      alwaysHaves: alwaysHaves.map((item) => ({ canonicalIngredientId: item.canonicalIngredientId, displayName: item.canonicalIngredient.displayName, enabled: item.enabled })),
      history,
    };
  } finally {
    await sqlite.close();
  }
}

export async function getRecipeOpsList(
  searchText?: string,
): Promise<RecipeOpsListItem[]> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const rows = await db.query.householdRecipes
      .findMany({
        where: (table, { eq }) => eq(table.householdId, context.householdId),
        with: {
          pin: {
            with: {
              recipeExtractions: {
                orderBy: (table, { desc: orderDesc }) => [
                  orderDesc(table.createdAt),
                ],
              },
            },
          },
          recipeInstructions: {
            with: {
              ingredients: {
                columns: {
                  normalizationStatus: true,
                },
              },
            },
          },
        },
      });
    const normalizedQuery = searchText?.trim().toLowerCase() ?? "";

    return rows
      .map((row) => {
        const latestExtraction = row.pin.recipeExtractions[0];
        const ingredientReviewCount = getIngredientReviewCount(
          row.recipeInstructions?.ingredients,
        );
        const status = derivePinStatus({
          hasRecipe: Boolean(row.recipeInstructions),
          latestExtractionStatus: latestExtraction?.status,
          latestExtractionLowConfidence: latestExtraction?.lowConfidence,
          ingredientReviewCount,
        });
        const summary = summarizeRecipeOps({
          status,
          hasRecipeContent: Boolean(row.recipeInstructions),
          latestExtractionStatus: latestExtraction?.status ?? null,
          latestFailureReason: latestExtraction?.failureReason ?? null,
          latestLowConfidence: latestExtraction?.lowConfidence ?? false,
          ingredientReviewCount,
          latestWarnings: parseJsonArray(latestExtraction?.warningsJson),
        });

        return {
          recipeId: row.recipeId,
          pinId: row.pin.pinterestPinId,
          title:
            row.title ??
            row.pin.title ??
            row.recipeInstructions?.title ??
            "Untitled recipe",
          boardId: row.pin.pinterestBoardId,
          status,
          isFlagged: row.isFlagged,
          updatedAt: row.updatedAt,
          imageUrl:
            row.imageUrl ??
            row.recipeInstructions?.imageUrl ??
            getPinImageUrl(row.pin.mediaJson, row.pin.rawJson),
          sourceUrl: row.recipeInstructions?.canonicalUrl ?? row.pin.link,
          statusSummary: summary.plainLanguageStatus,
          statusReason: summary.latestAttentionReason,
        } satisfies RecipeOpsListItem;
      })
      .filter(
        (row) =>
          !normalizedQuery ||
          `${row.title} ${row.boardId} ${row.sourceUrl ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery),
      )
      .sort((left, right) =>
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
      );
  } finally {
    await sqlite.close();
  }
}

export async function getRecipeOpsDetail(
  recipeId: string,
): Promise<RecipeOpsDetail | null> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const row = await db.query.householdRecipes
      .findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.recipeId, recipeId),
            eq(table.householdId, context.householdId),
          ),
        with: {
          pin: {
            with: {
              recipeExtractions: {
                orderBy: (table, { desc: orderDesc }) => [
                  orderDesc(table.createdAt),
                ],
                with: {
                  attempts: {
                    orderBy: (table, { desc: orderDesc }) => [
                      orderDesc(table.qualityScore),
                      orderDesc(table.createdAt),
                    ],
                  },
                  feedback: {
                    orderBy: (table, { desc: orderDesc }) => [
                      orderDesc(table.createdAt),
                    ],
                  },
                },
              },
              recipeSources: {
                orderBy: (table, { desc: orderDesc }) => [
                  orderDesc(table.fetchedAt),
                ],
              },
            },
          },
          recipeInstructions: {
            with: {
              ingredients: {
                orderBy: (table, { asc }) => [asc(table.position)],
                with: {
                  canonicalIngredient: {
                    with: {
                      parentCanonicalIngredient: true,
                    },
                  },
                },
              },
              steps: {
                orderBy: (table, { asc }) => [asc(table.position)],
              },
            },
          },
          feedback: true,
          extractionFeedback: {
            orderBy: (table, { desc: orderDesc }) => [
              orderDesc(table.createdAt),
            ],
          },
        },
      });

    if (!row) {
      return null;
    }

    const latestExtraction = row.pin.recipeExtractions[0];
    const latestSource = row.pin.recipeSources[0];
    const ingredientReviewCount = getIngredientReviewCount(
      row.recipeInstructions?.ingredients,
    );
    const hasRecipeContent =
      Boolean(row.recipeInstructions) &&
      ((row.recipeInstructions?.ingredients.length ?? 0) > 0 ||
        (row.recipeInstructions?.steps.length ?? 0) > 0);
    const status = derivePinStatus({
      hasRecipe: Boolean(row.recipeInstructions),
      latestExtractionStatus: latestExtraction?.status,
      latestExtractionLowConfidence: latestExtraction?.lowConfidence,
      ingredientReviewCount,
    });
    const summary = summarizeRecipeOps({
      status,
      hasRecipeContent,
      latestExtractionStatus: latestExtraction?.status ?? null,
      latestFailureReason: latestExtraction?.failureReason ?? null,
      latestLowConfidence: latestExtraction?.lowConfidence ?? false,
      ingredientReviewCount,
      latestWarnings: parseJsonArray(latestExtraction?.warningsJson),
    });

    return {
      recipeId: row.recipeId,
      pinId: row.pin.pinterestPinId,
      title:
        row.title ??
        row.pin.title ??
        row.recipeInstructions?.title ??
        "Untitled recipe",
      boardId: row.pin.pinterestBoardId,
      status,
      imageUrl:
        row.imageUrl ??
        row.recipeInstructions?.imageUrl ??
        getPinImageUrl(row.pin.mediaJson, row.pin.rawJson),
      sourceUrl: row.recipeInstructions?.canonicalUrl ?? row.pin.link,
      latestPagePreviewDataUrl: latestSource?.pagePreviewDataUrl ?? null,
      recipeSummary:
        row.description ??
        row.recipeInstructions?.description ??
        (latestExtraction
          ? `${latestExtraction.status.replaceAll("_", " ")}${latestExtraction.method ? ` via ${latestExtraction.method}` : ""}`
          : null),
      plainLanguageStatus: summary.plainLanguageStatus,
      actionableIssues: summary.actionableIssues,
      recommendedNextStep: summary.recommendedNextStep,
      latestAttentionReason: summary.latestAttentionReason,
      hasRecipeContent,
      ingredientReviewCount,
      latestFetchStatus: latestSource?.fetchStatus ?? null,
      latestFetchAt: latestSource?.fetchedAt ?? null,
      latestExtractionStatus: latestExtraction?.status ?? null,
      latestExtractionMethod: latestExtraction?.method ?? null,
      latestFetchStrategy: latestExtraction?.fetchStrategy ?? null,
      latestContentVariant: latestExtraction?.contentVariant ?? null,
      latestExtractionStrategy: latestExtraction?.extractionStrategy ?? null,
      latestQualityScore: latestExtraction?.qualityScore ?? null,
      latestConfidence: latestExtraction?.confidence ?? null,
      latestLowConfidence: latestExtraction?.lowConfidence ?? false,
      latestFailureReason: latestExtraction?.failureReason ?? null,
      latestQualitySignals: parseJsonRecord(
        latestExtraction?.qualitySignalsJson,
      ),
      latestExtractionWarnings: parseJsonArray(latestExtraction?.warningsJson),
      latestExtractionPayload: parseJsonRecord(latestExtraction?.payloadJson),
      recipeFeedback: row.feedback
        ? {
            feedbackId: row.feedback.feedbackId,
            summary: row.feedback.summary,
            note: row.feedback.note,
            updatedAt: row.feedback.updatedAt,
          }
        : null,
      latestRunFeedback: row.extractionFeedback.map((feedback) => ({
        feedbackId: feedback.feedbackId,
        extractionId: feedback.extractionId,
        category:
          feedback.category as RecipeOpsDetail["latestRunFeedback"][number]["category"],
        note: feedback.note,
        createdAt: feedback.createdAt,
      })),
      ingredients:
        row.recipeInstructions?.ingredients.map((ingredient) => ({
          id: ingredient.ingredientId,
          amount: ingredient.amountText,
          unit: ingredient.unit,
          originalText: ingredient.originalText,
          parsedText: ingredient.ingredientText,
          notes: ingredient.notes,
          canonicalIngredientId: ingredient.canonicalIngredientId,
          canonicalName: ingredient.canonicalIngredient?.displayName ?? null,
          parentCanonicalIngredientId:
            ingredient.canonicalIngredient?.parentCanonicalIngredientId ?? null,
          parentCanonicalName:
            ingredient.canonicalIngredient?.parentCanonicalIngredient
              ?.displayName ?? null,
          ingredientKind:
            ingredient.canonicalIngredient?.ingredientKind === "family" ||
            ingredient.canonicalIngredient?.ingredientKind === "base" ||
            ingredient.canonicalIngredient?.ingredientKind === "leaf"
              ? ingredient.canonicalIngredient.ingredientKind
              : null,
          attributes: parseJsonArray(ingredient.attributesJson),
          matchConfidence: ingredient.matchConfidence,
          matchedBy: ingredient.matchedBy,
          normalizationStatus: toIngredientStatus(
            ingredient.normalizationStatus,
          ),
        })) ?? [],
      steps:
        row.recipeInstructions?.steps.map((step) => ({
          id: step.stepId,
          section: step.section,
          text: step.text,
        })) ?? [],
      latestAttempts:
        latestExtraction?.attempts.map((attempt) => ({
          attemptId: attempt.attemptId,
          createdAt: attempt.createdAt,
          status: attempt.status,
          method: attempt.method,
          fetchStrategy: attempt.fetchStrategy,
          contentVariant: attempt.contentVariant,
          extractionStrategy: attempt.extractionStrategy,
          qualityScore: attempt.qualityScore,
          confidence: attempt.confidence,
          selected: attempt.selected,
          failureReason: attempt.failureReason,
          warnings: parseJsonArray(attempt.warningsJson),
          qualitySignals: parseJsonRecord(attempt.qualitySignalsJson),
          payload: parseJsonRecord(attempt.payloadJson),
        })) ?? [],
      history: row.pin.recipeExtractions.map((extraction) => ({
        extractionId: extraction.extractionId,
        createdAt: extraction.createdAt,
        status: extraction.status,
        method: extraction.method,
        fetchStrategy: extraction.fetchStrategy,
        contentVariant: extraction.contentVariant,
        extractionStrategy: extraction.extractionStrategy,
        qualityScore: extraction.qualityScore,
        confidence: extraction.confidence,
        lowConfidence: extraction.lowConfidence,
        failureReason: extraction.failureReason,
        warnings: parseJsonArray(extraction.warningsJson),
        qualitySignals: parseJsonRecord(extraction.qualitySignalsJson),
        payload: parseJsonRecord(extraction.payloadJson),
        summary: describeExtractionSummary(
          extraction.status,
          extraction.failureReason,
          extraction.lowConfidence,
          extraction.method,
        ),
        feedback: extraction.feedback.map((feedback) => ({
          feedbackId: feedback.feedbackId,
          category:
            feedback.category as RecipeOpsDetail["history"][number]["feedback"][number]["category"],
          note: feedback.note,
          createdAt: feedback.createdAt,
        })),
        attempts: extraction.attempts.map((attempt) => ({
          attemptId: attempt.attemptId,
          createdAt: attempt.createdAt,
          status: attempt.status,
          method: attempt.method,
          fetchStrategy: attempt.fetchStrategy,
          contentVariant: attempt.contentVariant,
          extractionStrategy: attempt.extractionStrategy,
          qualityScore: attempt.qualityScore,
          confidence: attempt.confidence,
          selected: attempt.selected,
          failureReason: attempt.failureReason,
          warnings: parseJsonArray(attempt.warningsJson),
          qualitySignals: parseJsonRecord(attempt.qualitySignalsJson),
          payload: parseJsonRecord(attempt.payloadJson),
        })),
      })),
    };
  } finally {
    await sqlite.close();
  }
}

export async function getRecipeParseJobSummaries(): Promise<RecipeParseJobSummary[]> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const jobs = await db.query.householdRecipeParseJobs.findMany({
      // Keep a short history alongside any in-flight work so people can see
      // the outcome of their recent bulk operations.
      where: (table, { eq }) => eq(table.householdId, context.householdId),
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
      limit: 12,
      with: {
        items: {
          columns: {
            status: true,
          },
        },
      },
    });

    return jobs.map((job) => toRecipeParseJobSummary(job, context.clerkUserId));
  } finally {
    await sqlite.close();
  }
}

export async function getRecipeParseJobDetail(jobId: string): Promise<RecipeParseJobDetail | null> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const job = await db.query.householdRecipeParseJobs.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, context.householdId), eq(table.jobId, jobId)),
      with: {
        items: {
          orderBy: (table, { asc: orderAsc }) => [orderAsc(table.position)],
          with: {
            recipe: {
              columns: {
                recipeId: true,
                title: true,
              },
              with: {
                pin: {
                  columns: {
                    title: true,
                  },
                },
                recipeInstructions: {
                  columns: {
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!job) {
      return null;
    }

    const summary = toRecipeParseJobSummary(job, context.clerkUserId);
    return {
      ...summary,
      items: job.items.map((item) => ({
        jobItemId: item.jobItemId,
        recipeId: item.recipeId,
        title: item.recipe.title ?? item.recipe.pin.title ?? item.recipe.recipeInstructions?.title ?? "Untitled recipe",
        status: item.status as RecipeParseJobDetail["items"][number]["status"],
        attemptCount: item.attemptCount,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        lastError: item.lastError,
        lastExtractionId: item.lastExtractionId,
      })),
    };
  } finally {
    await sqlite.close();
  }
}

export async function getBoardSummaries(): Promise<BoardSyncSummary[]> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const syncedBoardRows = await db.query.householdBoards
      .findMany({
        where: (table, { eq }) => eq(table.householdId, context.householdId),
        orderBy: (table, { desc: orderDesc }) => [
          orderDesc(table.lastSyncedAt),
        ],
      });
    const subscriptionRows = await db.query.boardSyncSubscriptions
      .findMany({
        where: (table, { eq }) => eq(table.householdId, context.householdId),
        orderBy: (table, { asc }) => [asc(table.boardName)],
      });
    const recipeRows = await db.query.householdRecipes
      .findMany({
        where: (table, { eq }) => eq(table.householdId, context.householdId),
        with: {
          pin: {
            with: {
              recipeExtractions: {
                orderBy: (table, { desc: orderDesc }) => [
                  orderDesc(table.createdAt),
                ],
              },
            },
          },
          recipeInstructions: {
            with: {
              ingredients: {
                columns: {
                  normalizationStatus: true,
                },
              },
            },
          },
        },
      });

    const syncedBoardById = new Map(
      syncedBoardRows.map((board) => [board.pinterestBoardId, board]),
    );

    return subscriptionRows.map((subscription) => {
      const syncedBoard = syncedBoardById.get(subscription.pinterestBoardId);
      const boardRecipes = recipeRows.filter(
        (recipe) =>
          recipe.pin.pinterestBoardId === subscription.pinterestBoardId,
      );
      const statuses = boardRecipes.map((recipe) =>
        derivePinStatus({
          hasRecipe: Boolean(recipe.recipeInstructions),
          latestExtractionStatus: recipe.pin.recipeExtractions[0]?.status,
          latestExtractionLowConfidence:
            recipe.pin.recipeExtractions[0]?.lowConfidence,
          ingredientReviewCount: getIngredientReviewCount(
            recipe.recipeInstructions?.ingredients,
          ),
        }),
      );

      return {
        boardId: subscription.pinterestBoardId,
        name: syncedBoard?.name ?? subscription.boardName,
        syncEnabled: subscription.syncEnabled,
        pinCount: boardRecipes.length,
        recipeCount: statuses.filter((status) => status === "recipe_ready")
          .length,
        pendingCount: statuses.filter((status) => status === "not_extracted")
          .length,
        failedCount: statuses.filter((status) => status === "extraction_failed")
          .length,
        reviewCount: statuses.filter((status) => status === "needs_review")
          .length,
        lastSyncedAt: syncedBoard?.lastSyncedAt ?? null,
      } satisfies BoardSyncSummary;
    });
  } finally {
    await sqlite.close();
  }
}

export async function getBoardSyncOptions(): Promise<BoardSyncSummary[]> {
  const context = await requireHouseholdContext();
  const storedBoards = await getBoardSummaries();
  const storedById = new Map(
    storedBoards.map((board) => [board.boardId, board]),
  );

  let remoteBoards: Array<{ id: string; name?: string | null }> = [];

  try {
    remoteBoards = await listRemotePinterestBoards(context.householdId);
  } catch {
    remoteBoards = [];
  }

  const mergedBoards = new Map<string, BoardSyncSummary>();

  for (const board of remoteBoards) {
    const stored = storedById.get(board.id);
    mergedBoards.set(board.id, {
      boardId: board.id,
      name: board.name ?? stored?.name ?? null,
      syncEnabled: stored?.syncEnabled ?? false,
      pinCount: stored?.pinCount ?? 0,
      recipeCount: stored?.recipeCount ?? 0,
      pendingCount: stored?.pendingCount ?? 0,
      failedCount: stored?.failedCount ?? 0,
      reviewCount: stored?.reviewCount ?? 0,
      lastSyncedAt: stored?.lastSyncedAt ?? null,
    });
  }

  for (const board of storedBoards) {
    mergedBoards.set(board.boardId, mergedBoards.get(board.boardId) ?? board);
  }

  return [...mergedBoards.values()].sort((left, right) => {
    if (left.syncEnabled !== right.syncEnabled) {
      return Number(right.syncEnabled) - Number(left.syncEnabled);
    }

    const leftLabel = left.name ?? left.boardId;
    const rightLabel = right.name ?? right.boardId;
    return leftLabel.localeCompare(rightLabel);
  });
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const cards = await getFeedPins();
  const boardSummaries = await getBoardSummaries();

  return {
    totalPins: cards.length,
    totalRecipes: cards.filter((card) => card.status === "recipe_ready").length,
    pendingRecipes: cards.filter((card) => card.status === "not_extracted")
      .length,
    failedRecipes: cards.filter((card) => card.status === "extraction_failed")
      .length,
    reviewNeeded: cards.filter((card) => card.status === "needs_review").length,
    boardsTracked: boardSummaries.length,
  };
}

export async function getLatestIssues(limit = 8) {
  return (await getRecipeOpsList())
    .filter((item) => item.status !== "recipe_ready")
    .slice(0, limit);
}

export async function getRecipeHouseholdPinId(
  recipeId: string,
): Promise<string | null> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const row = await db.query.householdRecipes
      .findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.recipeId, recipeId),
            eq(table.householdId, context.householdId),
          ),
        columns: {
          pinId: true,
        },
      });

    return row?.pinId ?? null;
  } finally {
    await sqlite.close();
  }
}

export async function getHouseholdMembersView(): Promise<
  HouseholdMemberView[]
> {
  const context = await requireHouseholdContext();
  const members = await listHouseholdMembers(context.householdId);
  const client = await clerkClient();

  const memberNames = await Promise.all(
    members.map(async (member) => {
      try {
        const user = await client.users.getUser(member.clerkUserId);
        return formatReviewerName(user.firstName, user.lastName, user.username);
      } catch {
        return "Household member";
      }
    }),
  );

  return members.map((member, index) => ({
    clerkUserId: member.clerkUserId,
    name: memberNames[index],
    role: member.role as "owner" | "member",
    joinedAt: member.joinedAt,
    isCurrentUser: member.clerkUserId === context.clerkUserId,
  }));
}

export async function getLatestInvite() {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    return await db.query.householdInvites
      .findFirst({
        where: (table, { and, eq, isNull, gt }) =>
          and(
            eq(table.householdId, context.householdId),
            isNull(table.consumedAt),
            gt(table.expiresAt, new Date().toISOString()),
          ),
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
      });
  } finally {
    await sqlite.close();
  }
}

export async function getCanonicalIngredientOptions(): Promise<
  CanonicalIngredientOption[]
> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    return await getCanonicalIngredientOptionsForHousehold(db, context.householdId);
  } finally {
    await sqlite.close();
  }
}

export async function getIngredientCatalog(
  page = 1,
  pageSize = 25,
  query = "",
): Promise<IngredientCatalogPageView> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();
  try {
    const normalizedPageSize = Number.isInteger(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 25;
    const normalizedQuery = query.trim().slice(0, 100);
    const searchPattern = `%${normalizedQuery}%`;
    const where = and(
      eq(householdCanonicalIngredients.householdId, context.householdId),
      normalizedQuery
        ? sql`(
            ${householdCanonicalIngredients.displayName} LIKE ${searchPattern} COLLATE NOCASE
            OR EXISTS (
              SELECT 1 FROM ${householdIngredientAliases}
              WHERE ${householdIngredientAliases.canonicalIngredientId} = ${householdCanonicalIngredients.canonicalIngredientId}
                AND ${householdIngredientAliases.householdId} = ${context.householdId}
                AND ${householdIngredientAliases.aliasText} LIKE ${searchPattern} COLLATE NOCASE
            )
            OR EXISTS (
              SELECT 1 FROM ${householdCanonicalIngredients} AS parent_ingredient
              WHERE parent_ingredient.canonical_ingredient_id = ${householdCanonicalIngredients.parentCanonicalIngredientId}
                AND parent_ingredient.display_name LIKE ${searchPattern} COLLATE NOCASE
            )
          )`
        : undefined,
    );
    const totalCount = await db.$count(householdCanonicalIngredients, where);
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / normalizedPageSize);
    const currentPage = totalPages === 0 ? 1 : Math.min(Math.max(Math.trunc(page) || 1, 1), totalPages);
    const rows = await db.query.householdCanonicalIngredients.findMany({
      where,
      orderBy: (table, { asc }) => [asc(table.displayName)],
      limit: normalizedPageSize,
      offset: (currentPage - 1) * normalizedPageSize,
      with: { parentCanonicalIngredient: true, aliases: true },
    });
    const ids = rows.map((row) => row.canonicalIngredientId);
    const usageRows = ids.length === 0
      ? []
      : await db.all<{ canonicalIngredientId: string; count: number }>(sql`
          SELECT ${householdRecipeIngredients.canonicalIngredientId} AS canonicalIngredientId, count(*) AS count
          FROM ${householdRecipeIngredients}
          WHERE ${and(
            eq(householdRecipeIngredients.householdId, context.householdId),
            inArray(householdRecipeIngredients.canonicalIngredientId, ids),
          )}
          GROUP BY ${householdRecipeIngredients.canonicalIngredientId}
        `);
    const usageCountById = new Map(usageRows.map((row) => [row.canonicalIngredientId, Number(row.count)]));
    const items: IngredientCatalogPageView["items"] = rows.map((row) => ({
      canonicalIngredientId: row.canonicalIngredientId, displayName: row.displayName,
      ingredientKind: row.ingredientKind === "family" || row.ingredientKind === "base" ? row.ingredientKind as "family" | "base" : "leaf",
      catalogStatus: row.catalogStatus === "provisional" ? "provisional" : "confirmed",
      parentCanonicalIngredientId: row.parentCanonicalIngredientId,
      parentDisplayName: row.parentCanonicalIngredient?.displayName ?? null,
      aliases: row.aliases.map((alias) => alias.aliasText), usageCount: usageCountById.get(row.canonicalIngredientId) ?? 0,
    }));
    return { items, page: currentPage, pageSize: normalizedPageSize, totalCount, totalPages, query: normalizedQuery };
  } finally { await sqlite.close(); }
}

export async function searchCanonicalIngredients(query: string, limit = 12): Promise<CanonicalIngredientOption[]> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();
  try {
    const normalizedQuery = query.trim().slice(0, 100);
    if (!normalizedQuery) return [];
    const searchPattern = `%${normalizedQuery}%`;
    const rows = await db.query.householdCanonicalIngredients.findMany({
      where: and(
        eq(householdCanonicalIngredients.householdId, context.householdId),
        sql`(
          ${householdCanonicalIngredients.displayName} LIKE ${searchPattern} COLLATE NOCASE
          OR EXISTS (
            SELECT 1 FROM ${householdIngredientAliases}
            WHERE ${householdIngredientAliases.canonicalIngredientId} = ${householdCanonicalIngredients.canonicalIngredientId}
              AND ${householdIngredientAliases.householdId} = ${context.householdId}
              AND ${householdIngredientAliases.aliasText} LIKE ${searchPattern} COLLATE NOCASE
          )
        )`,
      ),
      orderBy: (table, { asc }) => [asc(table.displayName)],
      limit: Math.min(Math.max(Math.trunc(limit) || 12, 1), 20),
      with: { parentCanonicalIngredient: true },
    });
    return rows.map((ingredient) => ({
      canonicalIngredientId: ingredient.canonicalIngredientId,
      displayName: ingredient.displayName,
      ingredientKind: ingredient.ingredientKind === "family" || ingredient.ingredientKind === "base" ? ingredient.ingredientKind : "leaf",
      catalogStatus: ingredient.catalogStatus === "provisional" ? "provisional" : "confirmed",
      parentCanonicalIngredientId: ingredient.parentCanonicalIngredientId,
      parentDisplayName: ingredient.parentCanonicalIngredient?.displayName ?? null,
    }));
  } finally { await sqlite.close(); }
}

export async function getIngredientReviewQueue(
  page = 1,
  pageSize = 20,
  recipeId?: string,
): Promise<IngredientReviewQueuePageView> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const normalizedPageSize = Number.isInteger(pageSize)
      ? Math.min(Math.max(pageSize, 1), 100)
      : 20;
    const reviewWhere = and(
      eq(householdRecipeIngredients.householdId, context.householdId),
      eq(householdRecipeIngredients.normalizationStatus, "needs_review"),
      eq(householdRecipeIngredients.reviewDisposition, "pending"),
      recipeId ? eq(householdRecipeIngredients.recipeId, recipeId) : undefined,
    );
    const totalCount = await db.$count(householdRecipeIngredients, reviewWhere);
    const totalPages =
      totalCount === 0 ? 0 : Math.ceil(totalCount / normalizedPageSize);
    const currentPage =
      totalPages === 0
        ? 1
        : Math.min(Math.max(Math.trunc(page) || 1, 1), totalPages);
    const offset = (currentPage - 1) * normalizedPageSize;
    const rows = await db.query.householdRecipeIngredients
      .findMany({
        where: reviewWhere,
        orderBy: (table, { asc }) => [asc(table.recipeId), asc(table.position)],
        limit: normalizedPageSize,
        offset,
        with: {
          canonicalIngredient: {
            with: {
              parentCanonicalIngredient: true,
            },
          },
          recipeInstructions: {
            with: {
              recipe: {
                with: {
                  pin: true,
                },
              },
            },
          },
        },
      });

    const occurrenceCountByPhrase = new Map<string, number>();

    for (const ingredient of rows) {
      const key =
        ingredient.normalizedIngredientPhrase ?? ingredient.originalText;
      occurrenceCountByPhrase.set(
        key,
        (occurrenceCountByPhrase.get(key) ?? 0) + 1,
      );
    }

    const items = rows.map((ingredient) => {
      const aiSuggestions = parseIngredientReviewSuggestions(
        ingredient.aiSuggestionsJson,
      );
      const preferredSuggestion = aiSuggestions[0];

      return {
        ingredientId: ingredient.ingredientId,
        recipeId: ingredient.recipeId,
        recipeTitle:
          ingredient.recipeInstructions.recipe.title ??
          ingredient.recipeInstructions.recipe.pin.title ??
          ingredient.recipeInstructions.title ??
          "Untitled recipe",
        originalText: ingredient.originalText,
        amountText: ingredient.amountText,
        unit: ingredient.unit,
        notes: ingredient.notes,
        parsedIngredientText: ingredient.ingredientText,
        normalizedIngredientPhrase: ingredient.normalizedIngredientPhrase,
        suggestedCanonicalIngredientId:
          preferredSuggestion?.canonicalIngredientId ??
          ingredient.canonicalIngredientId,
        suggestedCanonicalName:
          preferredSuggestion?.canonicalName ??
          ingredient.canonicalIngredient?.displayName ??
          null,
        suggestedParentCanonicalIngredientId:
          preferredSuggestion?.parentCanonicalIngredientId ??
          ingredient.canonicalIngredient?.parentCanonicalIngredientId ??
          null,
        suggestedParentCanonicalName:
          preferredSuggestion?.parentCanonicalName ??
          ingredient.canonicalIngredient?.parentCanonicalIngredient
            ?.displayName ??
          null,
        suggestedAction:
          preferredSuggestion?.action ??
          (ingredient.canonicalIngredientId
            ? "match_existing"
            : "keep_unresolved"),
        suggestedIngredientKind:
          preferredSuggestion?.ingredientKind ??
          (ingredient.canonicalIngredient?.ingredientKind === "family" ||
          ingredient.canonicalIngredient?.ingredientKind === "base" ||
          ingredient.canonicalIngredient?.ingredientKind === "leaf"
            ? ingredient.canonicalIngredient.ingredientKind
            : null),
        suggestedAttributes:
          preferredSuggestion?.attributes ??
          parseJsonArray(ingredient.attributesJson),
        matchConfidence: ingredient.matchConfidence,
        matchedBy: ingredient.matchedBy,
        aiSuggestions,
        aiParseOutcome: toIngredientAiParseOutcome(ingredient.aiParseOutcome),
        aiParseReason: ingredient.aiParseReason,
        occurrenceCount:
          occurrenceCountByPhrase.get(
            ingredient.normalizedIngredientPhrase ?? ingredient.originalText,
          ) ?? 1,
        sourceUrl:
          ingredient.recipeInstructions.canonicalUrl ??
          ingredient.recipeInstructions.recipe.pin.link,
      };
    });

    return {
      items,
      page: currentPage,
      pageSize: normalizedPageSize,
      totalCount,
      totalPages,
    };
  } finally {
    await sqlite.close();
  }
}

function toFeedCard(row: RecipeGraph, subscriptionTier: "free" | "premium") {
  const latestExtraction = row.pin.recipeExtractions[0];
  const ingredientText = row.recipeInstructions?.ingredients
    .map((ingredient) =>
      [
        ingredient.ingredientText ?? ingredient.originalText,
        ingredient.canonicalIngredient?.displayName,
        parseJsonArray(ingredient.attributesJson).join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
  const aggregate = getRecipeReviewAggregate(row.reviews);
  const imageSources = getPinImageSources(row.pin.mediaJson, row.pin.rawJson);

  return {
    recipeId: row.recipeId,
    pinId: row.pin.pinterestPinId,
    title:
      row.title ??
      row.pin.title ??
      row.recipeInstructions?.title ??
      "Untitled recipe",
    imageUrl:
      row.imageUrl ??
      row.recipeInstructions?.imageUrl ??
      imageSources.imageUrl,
    previewImageUrl:
      imageSources.previewImageUrl !== imageSources.imageUrl
        ? imageSources.previewImageUrl
        : null,
    dominantColor: row.pin.dominantColor,
    destinationHref: resolveFeedCardHref({
      recipeId: row.recipeId,
      pinId: row.pin.pinterestPinId,
      subscriptionTier,
      fallbackUrl: row.recipeInstructions?.canonicalUrl ?? row.pin.link,
    }),
    siteName: row.recipeInstructions?.siteName ?? null,
    status: derivePinStatus({
      hasRecipe: Boolean(row.recipeInstructions),
      latestExtractionStatus: latestExtraction?.status,
      latestExtractionLowConfidence: latestExtraction?.lowConfidence,
      ingredientReviewCount: getIngredientReviewCount(
        row.recipeInstructions?.ingredients,
      ),
    }),
    hasRecipe: Boolean(row.recipeInstructions),
    averageRating: aggregate.averageRating,
    reviewCount: aggregate.reviewCount,
    searchText: [
      row.title,
      row.description,
      row.pin.title,
      row.pin.description,
      row.recipeInstructions?.title,
      row.recipeInstructions?.description,
      row.recipeInstructions?.siteName,
      row.pin.link,
      ingredientText,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    pin: row.pin,
  };
}

async function prepareFeedCards({
  rows,
  householdId,
  db,
  searchText,
  subscriptionTier,
}: {
  rows: RecipeGraph[];
  householdId: string;
  db: DatabaseHandle;
  searchText?: string;
  subscriptionTier: "free" | "premium";
}) {
  const normalizedQuery = searchText?.trim().toLowerCase() ?? "";
  const ingredientQuery = normalizedQuery
    ? await resolveIngredientSearchQuery(db, householdId, normalizedQuery)
    : null;

  return rows
    .map((row) => {
      const card = toFeedCard(row, subscriptionTier);
      const searchMatches = getFeedSearchMatches(
        row,
        normalizedQuery,
        ingredientQuery,
      );

      return {
        ...card,
        searchMatches,
        searchMatchTier: getBestSearchMatchTier(searchMatches),
        updatedAt: row.pin.updatedAt ?? "",
      };
    })
    .filter(
      (row) =>
        !normalizedQuery ||
        row.searchMatches.length > 0,
    )
    .sort(compareFeedRows);
}

function compareFeedRows(left: FeedCardRow, right: FeedCardRow) {
  if (left.searchMatchTier !== right.searchMatchTier) {
    return left.searchMatchTier - right.searchMatchTier;
  }

  const leftHasAverageRating = left.averageRating !== null;
  const rightHasAverageRating = right.averageRating !== null;
  if (leftHasAverageRating !== rightHasAverageRating) {
    return Number(rightHasAverageRating) - Number(leftHasAverageRating);
  }

  if ((right.averageRating ?? 0) !== (left.averageRating ?? 0)) {
    return (right.averageRating ?? 0) - (left.averageRating ?? 0);
  }

  const updatedAtCompare = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedAtCompare !== 0) {
    return updatedAtCompare;
  }

  return right.recipeId.localeCompare(left.recipeId);
}

function encodeFeedCursor(row: FeedCardRow) {
  return Buffer.from(
    JSON.stringify({
      searchMatchTier: row.searchMatchTier,
      averageRating: row.averageRating,
      updatedAt: row.updatedAt,
      recipeId: row.recipeId,
    }),
  ).toString("base64url");
}

function toRecipeParseJobSummary(
  job: {
    jobId: string;
    status: string;
    requestedByClerkUserId: string;
    totalRecipes: number;
    processedRecipes: number;
    succeededRecipes: number;
    reviewNeededRecipes: number;
    failedRecipes: number;
    rerun: boolean;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    cancelRequestedAt: string | null;
    lastHeartbeatAt: string | null;
    lastError: string | null;
    items: Array<{ status: string }>;
  },
  currentClerkUserId: string,
): RecipeParseJobSummary {
  const cancelledRecipes = job.items.filter((item) => item.status === "cancelled").length;
  const attemptedRecipes = job.processedRecipes;
  const needsResume = job.status !== "completed"
    && job.status !== "cancelled"
    && (Boolean(job.lastError) || isRecipeParseJobHeartbeatStale({
      status: job.status,
      createdAt: job.createdAt,
      lastHeartbeatAt: job.lastHeartbeatAt,
    }));
  const percentComplete = job.totalRecipes > 0
    ? Math.min(100, Math.round((attemptedRecipes / job.totalRecipes) * 100))
    : 0;

  return {
    jobId: job.jobId,
    status: job.status as RecipeParseJobSummary["status"],
    requestedByLabel: job.requestedByClerkUserId === currentClerkUserId ? "You" : job.requestedByClerkUserId,
    totalRecipes: job.totalRecipes,
    processedRecipes: job.processedRecipes,
    succeededRecipes: job.succeededRecipes,
    reviewNeededRecipes: job.reviewNeededRecipes,
    failedRecipes: job.failedRecipes,
    cancelledRecipes,
    percentComplete,
    rerun: job.rerun,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    cancelRequestedAt: job.cancelRequestedAt,
    lastHeartbeatAt: job.lastHeartbeatAt,
    lastError: job.lastError,
    currentPhase: describeRecipeParseJobPhase({
      status: job.status,
      cancelRequestedAt: job.cancelRequestedAt,
      processedRecipes: job.processedRecipes,
      totalRecipes: job.totalRecipes,
      cancelledRecipes,
      lastError: job.lastError,
      needsResume,
    }),
    canCancel: job.status === "queued" || job.status === "running" || job.status === "cancelling",
    canResume: needsResume,
  };
}

function describeRecipeParseJobPhase(input: {
  status: string;
  cancelRequestedAt: string | null;
  processedRecipes: number;
  totalRecipes: number;
  cancelledRecipes: number;
  lastError: string | null;
  needsResume: boolean;
}) {
  if (input.needsResume) {
    return input.lastError
      ? "Needs resume after a background job error"
      : "May be stalled. Resume to continue parsing";
  }

  if (input.status === "queued") {
    return "Queued";
  }

  if (input.status === "running") {
    return `Parsing ${input.processedRecipes} of ${input.totalRecipes}`;
  }

  if (input.status === "cancelling") {
    return "Cancelling immediately";
  }

  if (input.status === "cancelled") {
    return input.cancelledRecipes > 0
      ? `Cancelled after ${input.processedRecipes} recipes`
      : "Cancelled";
  }

  if (input.cancelRequestedAt) {
    return "Cancelled";
  }

  return "Completed";
}

function isRecipeParseJobHeartbeatStale(input: {
  status: string;
  createdAt: string;
  lastHeartbeatAt: string | null;
}) {
  if (input.status !== "queued" && input.status !== "running" && input.status !== "cancelling") {
    return false;
  }

  const timestamp = input.lastHeartbeatAt ?? input.createdAt;
  const heartbeatMs = new Date(timestamp).getTime();

  if (Number.isNaN(heartbeatMs)) {
    return true;
  }

  return Date.now() - heartbeatMs >= 2 * 60 * 1000;
}

function decodeFeedCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as {
      searchMatchTier?: unknown;
      averageRating?: unknown;
      updatedAt?: unknown;
      recipeId?: unknown;
    };

    if (
      typeof parsed.searchMatchTier !== "number"
      || (parsed.averageRating !== null && typeof parsed.averageRating !== "number")
      || typeof parsed.updatedAt !== "string"
      || typeof parsed.recipeId !== "string"
    ) {
      return null;
    }

    return {
      searchMatchTier: parsed.searchMatchTier,
      averageRating: parsed.averageRating,
      updatedAt: parsed.updatedAt,
      recipeId: parsed.recipeId,
    };
  } catch {
    return null;
  }
}

function isAfterCursor(
  row: FeedCardRow,
  cursor: {
    searchMatchTier: number;
    averageRating: number | null;
    updatedAt: string;
    recipeId: string;
  },
) {
  if (row.searchMatchTier !== cursor.searchMatchTier) {
    return row.searchMatchTier > cursor.searchMatchTier;
  }

  const rowHasAverageRating = row.averageRating !== null;
  const cursorHasAverageRating = cursor.averageRating !== null;
  if (rowHasAverageRating !== cursorHasAverageRating) {
    return Number(rowHasAverageRating) < Number(cursorHasAverageRating);
  }

  if ((row.averageRating ?? 0) !== (cursor.averageRating ?? 0)) {
    return (row.averageRating ?? 0) < (cursor.averageRating ?? 0);
  }

  if (row.updatedAt !== cursor.updatedAt) {
    return row.updatedAt.localeCompare(cursor.updatedAt) < 0;
  }

  return row.recipeId.localeCompare(cursor.recipeId) < 0;
}

function matchesCursor(
  row: FeedCardRow,
  cursor: {
    searchMatchTier: number;
    averageRating: number | null;
    updatedAt: string;
    recipeId: string;
  },
) {
  return (
    row.searchMatchTier === cursor.searchMatchTier
    && row.averageRating === cursor.averageRating
    && row.updatedAt === cursor.updatedAt
    && row.recipeId === cursor.recipeId
  );
}

export async function getRecipeTags(): Promise<RecipeTagView[]> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const rows = await db.query.recipeTags.findMany({
      where: (table, { eq }) => eq(table.householdId, context.householdId),
      orderBy: (table, { asc }) => [asc(table.name)],
    });
    return rows.map((tag) => ({ tagId: tag.tagId, name: tag.name }));
  } finally {
    await sqlite.close();
  }
}

export async function getRecipeTagCollections(): Promise<RecipeTagCollectionView[]> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();

  try {
    const tags = await db.query.recipeTags.findMany({
      where: (table, { eq }) => eq(table.householdId, context.householdId),
      orderBy: (table, { asc }) => [asc(table.name)],
      with: {
        memberships: {
          with: {
            recipe: {
              with: { pin: true, recipeInstructions: true },
            },
          },
        },
      },
    });
    return tags.map((tag) => ({
      tagId: tag.tagId,
      name: tag.name,
      recipeCount: tag.memberships.length,
      previewRecipes: tag.memberships
        .sort((left, right) => right.recipe.updatedAt.localeCompare(left.recipe.updatedAt))
        .slice(0, 5)
        .map(({ recipe }) => {
          const images = resolveRecipeImageSources(recipe.imageUrl, recipe.recipeInstructions?.imageUrl, recipe.pin.mediaJson, recipe.pin.rawJson);
          return { recipeId: recipe.recipeId, imageUrl: images.imageUrl, previewImageUrl: images.previewImageUrl, dominantColor: recipe.pin.dominantColor };
        }),
    }));
  } finally {
    await sqlite.close();
  }
}

export async function getRecipeTag(tagId: string): Promise<RecipeTagView | null> {
  const context = await requireHouseholdContext();
  const { db, sqlite } = await openDatabase();
  try {
    const tag = await db.query.recipeTags.findFirst({
      where: (table, { and, eq }) => and(eq(table.tagId, tagId), eq(table.householdId, context.householdId)),
    });
    return tag ? { tagId: tag.tagId, name: tag.name } : null;
  } finally {
    await sqlite.close();
  }
}

async function getFeedRecipeRows(db: DatabaseHandle, householdId: string, tagId?: string) {
  return await db.query.householdRecipes
    .findMany({
      where: (table, { and, eq }) => and(
        eq(table.householdId, householdId),
        tagId
          ? sql`${table.recipeId} IN (
              SELECT "feed_tag_membership"."recipe_id"
              FROM "recipe_tag_memberships" AS "feed_tag_membership"
              WHERE "feed_tag_membership"."household_id" = ${householdId}
                AND "feed_tag_membership"."tag_id" = ${tagId}
            )`
          : undefined,
      ),
      with: {
        pin: {
          with: {
            recipeExtractions: {
              orderBy: (table, { desc: orderDesc }) => [
                orderDesc(table.createdAt),
              ],
            },
          },
        },
        recipeInstructions: {
          with: {
            ingredients: {
              orderBy: (table, { asc }) => [asc(table.position)],
              with: {
                canonicalIngredient: true,
              },
            },
          },
        },
        reviews: {
          columns: {
            reviewId: true,
            ratingValue: true,
          },
        },
      },
    });
}

function getIngredientReviewCount(
  ingredients: Array<{ normalizationStatus: string }> | null | undefined,
) {
  return (
    ingredients?.filter(
      (ingredient) => ingredient.normalizationStatus === "needs_review",
    ).length ?? 0
  );
}

function describeExtractionSummary(
  status: string,
  failureReason: string | null,
  lowConfidence: boolean,
  method: string | null,
) {
  if (failureReason) {
    return failureReason;
  }

  if (status === "multiple_recipes_needs_review") {
    return "Multiple recipe candidates were detected and need a human decision.";
  }

  if (lowConfidence) {
    return `The parser saved a result${method ? ` using ${method}` : ""}, but it was marked low confidence.`;
  }

  return `${status.replaceAll("_", " ")}${method ? ` via ${method}` : ""}`;
}

function getFeedSearchMatches(
  row: RecipeGraph,
  normalizedQuery: string,
  ingredientQuery: Awaited<ReturnType<typeof resolveIngredientSearchQuery>>,
): FeedSearchMatch[] {
  if (!normalizedQuery) {
    return [];
  }

  const matches: FeedSearchMatch[] = [];
  const matchesPhrase = (values: Array<string | null | undefined>) =>
    values.some((value) => hasNormalizedPhrase(value, normalizedQuery));
  const addMatch = (match: FeedSearchMatch) => {
    if (
      !matches.some(
        (existing) =>
          existing.field === match.field &&
          existing.matchedText === match.matchedText &&
          existing.relatedText === match.relatedText,
      )
    ) {
      matches.push(match);
    }
  };

  if (matchesPhrase([row.title, row.pin.title, row.recipeInstructions?.title])) {
    addMatch({
      tier: 1,
      field: "title",
      matchedText: null,
      relatedText: null,
    });
  }

  for (const ingredient of row.recipeInstructions?.ingredients ?? []) {
    const ingredientLabel =
      ingredient.ingredientText ??
      ingredient.canonicalIngredient?.displayName ??
      ingredient.originalText;
    const attributeMatch = ingredientQuery?.attributes.every((attribute) =>
      parseJsonArray(ingredient.attributesJson).includes(attribute),
    );
    const hasResolvedCanonicalMatch = Boolean(
      ingredientQuery &&
        ingredient.canonicalIngredientId === ingredientQuery.canonicalIngredientId &&
        attributeMatch,
    );
    const isFamilyDescendant = Boolean(
      ingredientQuery?.ingredientKind === "family" &&
        ingredient.canonicalIngredientId &&
        ingredient.canonicalIngredientId !== ingredientQuery.canonicalIngredientId &&
        ingredientQuery.descendantCanonicalIngredientIds.includes(
          ingredient.canonicalIngredientId,
        ),
    );

    if (isFamilyDescendant) {
      addMatch({
        tier: 3,
        field: "family",
        matchedText: ingredientQuery?.canonicalDisplayName ?? normalizedQuery,
        relatedText: ingredientLabel,
      });
      continue;
    }

    const hasExactIngredientText = matchesPhrase([
      ingredient.originalText,
      ingredient.ingredientText,
      ingredient.canonicalIngredient?.displayName,
    ]);
    if (
      hasExactIngredientText ||
      (hasResolvedCanonicalMatch && ingredientQuery?.matchedBy !== "alias")
    ) {
      addMatch({
        tier: 1,
        field: "ingredient",
        matchedText: ingredientLabel,
        relatedText: null,
      });
      continue;
    }

    if (hasResolvedCanonicalMatch && ingredientQuery?.matchedBy === "alias") {
      addMatch({
        tier: 2,
        field: "alias",
        matchedText: ingredientQuery.normalizedIngredientPhrase,
        relatedText: ingredientLabel,
      });
    }
  }

  if (matchesPhrase([row.description, row.pin.description, row.recipeInstructions?.description])) {
    addMatch({ tier: 4, field: "description", matchedText: null, relatedText: null });
  }

  if (matchesPhrase([row.recipeInstructions?.siteName])) {
    addMatch({ tier: 4, field: "site", matchedText: null, relatedText: null });
  }

  if (matchesPhrase([row.pin.link, row.recipeInstructions?.canonicalUrl])) {
    addMatch({ tier: 4, field: "website", matchedText: null, relatedText: null });
  }

  return matches.sort((left, right) => left.tier - right.tier);
}

function getBestSearchMatchTier(matches: FeedSearchMatch[]) {
  return matches[0]?.tier ?? Number.MAX_SAFE_INTEGER;
}

function hasNormalizedPhrase(value: string | null | undefined, normalizedQuery: string) {
  if (!value || !normalizedQuery) {
    return false;
  }

  const normalizedValue = normalizeIngredientKey(value);
  return ` ${normalizedValue} `.includes(` ${normalizedQuery} `);
}

function getRecipeReviewAggregate(
  reviews: Array<{
    ratingValue: number;
  }>,
) {
  if (reviews.length === 0) {
    return {
      averageRating: null,
      reviewCount: 0,
    };
  }

  const total = reviews.reduce((sum, review) => sum + review.ratingValue, 0);

  return {
    averageRating: Math.round((total / reviews.length) * 10) / 10,
    reviewCount: reviews.length,
  };
}

async function getReviewerNameMap(householdId: string) {
  const members = await listHouseholdMembers(householdId);
  const client = await clerkClient();
  const entries = await Promise.all(
    members.map(async (member) => {
      try {
        const user = await client.users.getUser(member.clerkUserId);
        return [
          member.clerkUserId,
          formatReviewerName(user.firstName, user.lastName, user.username),
        ] as const;
      } catch {
        return [member.clerkUserId, "Household member"] as const;
      }
    }),
  );

  return new Map(entries);
}

function toRecipeReviewView(
  review: {
    reviewId: string;
    recipeId: string;
    recipeVersionId?: string | null;
    eventId: string | null;
    reviewedByClerkUserId: string | null;
    ratingValue: number;
    eatenOn: string | null;
    note: string | null;
    event?: {
      eventId: string;
      date: string;
    } | null;
  },
  recipe: {
    recipeId: string;
    title: string | null;
    imageUrl: string | null;
    pin: {
      title: string | null;
      mediaJson: string | null;
      rawJson: string;
    };
    recipeInstructions: {
      title: string | null;
      imageUrl: string | null;
    } | null;
  },
  reviewerNames: Map<string, string>,
  context: Awaited<ReturnType<typeof requireHouseholdContext>>,
  recipeVersionNumber = 1,
): RecipeReviewView {
  const recipeTitle =
    recipe.title ??
    recipe.pin.title ??
    recipe.recipeInstructions?.title ??
    "Untitled recipe";
  const recipeImageSources = resolveRecipeImageSources(
    recipe.imageUrl,
    recipe.recipeInstructions?.imageUrl,
    recipe.pin.mediaJson,
    recipe.pin.rawJson,
  );
  const canManage = canManageReview(review.reviewedByClerkUserId, context);

  return {
    reviewId: review.reviewId,
    recipeId: recipe.recipeId,
    recipeVersionNumber,
    eventId: review.eventId,
    recipeTitle,
    recipeImageUrl: recipeImageSources.imageUrl,
    recipePreviewImageUrl: recipeImageSources.previewImageUrl,
    ratingValue: review.ratingValue,
    eatenOn: review.event?.date ?? review.eatenOn,
    note: review.note,
    reviewerName: getReviewerName(review.reviewedByClerkUserId, reviewerNames),
    reviewerClerkUserId: review.reviewedByClerkUserId,
    canEdit: canManage,
    canDelete: canManage,
  };
}

function parseVersionIngredientLines(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function versionNumberForReview(
  recipeVersionId: string | null,
  versions: Array<{ recipeVersionId: string; versionNumber: number }>,
) {
  return versions.find((version) => version.recipeVersionId === recipeVersionId)?.versionNumber ?? 1;
}

function toRecipeVersionViews(
  versions: Array<{ recipeVersionId: string; versionNumber: number; ingredientsJson: string; note: string | null; createdAt: string }>,
  currentIngredients: string[],
): RecipeVersionView[] {
  const records = versions.length > 0
    ? versions
    : [{ recipeVersionId: null, versionNumber: 1, ingredientsJson: JSON.stringify(currentIngredients), note: "Original recipe", createdAt: "" }];
  return records.map((version, index) => {
    const ingredients = parseVersionIngredientLines(version.ingredientsJson);
    const prior = index > 0 ? parseVersionIngredientLines(records[index - 1].ingredientsJson) : [];
    return {
      recipeVersionId: version.recipeVersionId,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt || null,
      note: version.note,
      isPrimary: index === records.length - 1,
      ingredients,
      changes: {
        added: ingredients.filter((ingredient) => !prior.includes(ingredient)),
        removed: prior.filter((ingredient) => !ingredients.includes(ingredient)),
      },
    };
  });
}

function toRecipeHistoryEventView(
  event: {
    eventId: string;
    recipeId: string;
    date: string;
    createdByClerkUserId: string | null;
    recipe: {
      recipeId: string;
      title: string | null;
      imageUrl: string | null;
      description: string | null;
      pin: {
        title: string | null;
        description: string | null;
        mediaJson: string | null;
        rawJson: string;
      };
      recipeInstructions: {
        title: string | null;
        description: string | null;
        siteName: string | null;
        imageUrl: string | null;
      } | null;
    };
    review: {
      reviewId: string;
      recipeId: string;
      eventId: string | null;
      reviewedByClerkUserId: string | null;
      ratingValue: number;
      eatenOn: string | null;
      note: string | null;
    } | null;
  },
  reviewerNames: Map<string, string>,
  context: Awaited<ReturnType<typeof requireHouseholdContext>>,
): RecipeHistoryEventView {
  const recipeTitle =
    event.recipe.title ??
    event.recipe.pin.title ??
    event.recipe.recipeInstructions?.title ??
    "Untitled recipe";
  const recipeImageSources = resolveRecipeImageSources(
    event.recipe.imageUrl,
    event.recipe.recipeInstructions?.imageUrl,
    event.recipe.pin.mediaJson,
    event.recipe.pin.rawJson,
  );
  const detailText =
    event.recipe.recipeInstructions?.siteName ??
    event.recipe.description ??
    event.recipe.pin.description ??
    event.recipe.recipeInstructions?.description ??
    null;
  const review = event.review
    ? toRecipeReviewView(
        {
          ...event.review,
          event: {
            eventId: event.eventId,
            date: event.date,
          },
        },
        event.recipe,
        reviewerNames,
        context,
      )
    : null;
  const today = getTodayDayString();

  return {
    eventId: event.eventId,
    recipeId: event.recipeId,
    recipeTitle,
    recipeImageUrl: recipeImageSources.imageUrl,
    recipePreviewImageUrl: recipeImageSources.previewImageUrl,
    date: event.date,
    isPlanned: event.date > today,
    detailText,
    review,
    canAddReview: event.date <= today && !review,
    canDelete: canManageRecipeEvent(
      event.createdByClerkUserId,
      event.review,
      context,
    ),
  };
}

function compareReviewsByDate(left: RecipeReviewView, right: RecipeReviewView) {
  const leftDate = left.eatenOn ?? "";
  const rightDate = right.eatenOn ?? "";

  if (leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate);
  }

  return right.reviewId.localeCompare(left.reviewId);
}

function buildMonthStart(month: string) {
  return `${month}-01`;
}

function canManageReview(
  reviewedByClerkUserId: string | null,
  context: Awaited<ReturnType<typeof requireHouseholdContext>>,
) {
  if (context.role === "owner") {
    return true;
  }

  return Boolean(
    reviewedByClerkUserId && reviewedByClerkUserId === context.clerkUserId,
  );
}

function canManageRecipeEvent(
  createdByClerkUserId: string | null,
  review: {
    reviewedByClerkUserId: string | null;
  } | null,
  context: Awaited<ReturnType<typeof requireHouseholdContext>>,
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

function getReviewerName(
  reviewerClerkUserId: string | null,
  reviewerNames: Map<string, string>,
) {
  if (!reviewerClerkUserId) {
    return "Household member";
  }

  return reviewerNames.get(reviewerClerkUserId) ?? "Household member";
}

function formatReviewerName(
  firstName: string | null,
  lastName: string | null,
  username: string | null,
) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  if (username?.trim()) {
    return username.trim();
  }

  return `Household member`;
}

function toIngredientStatus(
  value: string,
): "auto_matched" | "needs_review" | "confirmed" {
  if (value === "confirmed") {
    return "confirmed";
  }

  if (value === "needs_review") {
    return "needs_review";
  }

  return "auto_matched";
}

function parseIngredientReviewSuggestions(
  value: string | null | undefined,
): IngredientReviewSuggestionView[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isIngredientReviewSuggestion);
  } catch {
    return [];
  }
}

function toIngredientAiParseOutcome(
  value: string | null | undefined,
): "parsed" | "not_ingredient" | "unresolved" | null {
  if (value === "parsed" || value === "not_ingredient" || value === "unresolved") {
    return value;
  }

  return null;
}

function isIngredientReviewSuggestion(
  value: unknown,
): value is IngredientReviewSuggestionView {
  if (!value || typeof value !== "object") {
    return false;
  }

  const suggestion = value as Record<string, unknown>;
  const action = suggestion.action;
  const confidence = suggestion.confidence;
  const reason = suggestion.reason;

  return (
    (action === "match_existing" ||
      action === "create_new" ||
      action === "keep_unresolved") &&
    typeof confidence === "number" &&
    typeof reason === "string"
  );
}
