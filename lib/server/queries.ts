import { clerkClient } from "@clerk/nextjs/server";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";

import { getCurrentUserAccess, resolveFeedCardHref } from "@/lib/server/access";
import {
  listHouseholdMembers,
  requireHouseholdContext,
} from "@/lib/server/auth";
import { openDatabase } from "@/lib/server/database";
import {
  boardSyncSubscriptions,
  householdBoards,
  householdInvites,
  householdRecipeParseJobItems,
  householdRecipeParseJobs,
  householdRecipeIngredients,
  householdRecipeEvents,
  householdRecipeInstructions,
  householdRecipeReviews,
  recipeFolderMemberships,
  recipeFolders,
} from "@/lib/server/db";
import {
  getCanonicalIngredientOptionsForHousehold,
  resolveIngredientSearchQuery,
} from "@/lib/server/ingredient-normalization";
import { getPinImageSources, getPinImageUrl } from "@/lib/server/media";
import { listRemotePinterestBoards } from "@/lib/server/pinterest";
import { summarizeRecipeOps } from "@/lib/server/recipe-ops-summary";
import { derivePinStatus } from "@/lib/server/status";
import { resolveRecipeImageSources } from "@/lib/recipe-image-sources";
import {
  buildCalendarDays,
  formatDay,
  formatMonthLabel,
  getTodayDayString,
  getTodayMonthString,
  isValidMonthString,
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
  HouseholdMemberView,
  IngredientReviewItemView,
  IngredientReviewQueuePageView,
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
  RecipeReviewView,
} from "@/types/view-models";

type DatabaseHandle = Awaited<ReturnType<typeof openDatabase>>["db"];
type RecipeGraph = Awaited<ReturnType<typeof getFeedRecipeRows>>[number];
type FeedCardRow = FeedPinCard & {
  ingredientMatchScore: number;
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

    return cards.map(({ updatedAt: _updatedAt, ingredientMatchScore: _score, ...card }) => card);
  } finally {
    await sqlite.close();
  }
}

export async function getFeedPinsPage({
  searchText,
  cursor,
  pageSize = DEFAULT_FEED_PAGE_SIZE,
}: {
  searchText?: string;
  cursor?: string | null;
  pageSize?: number;
}): Promise<FeedPinsPage> {
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

    const latestExtraction = row.pin.recipeExtractions[0];
    const reviewerNames = await getReviewerNameMap(context.householdId);
    const reviews = row.reviews
      .map((review) => toRecipeReviewView(review, row, reviewerNames, context))
      .sort(compareReviewsByDate);
    const aggregate = getRecipeReviewAggregate(row.reviews);
    const folderPath = buildRecipeFolderPath(row.folderMemberships[0]?.folder ?? null);
    const imageSources = resolveRecipeImageSources(
      row.imageUrl,
      row.recipeInstructions?.imageUrl,
      row.pin.mediaJson,
      row.pin.rawJson,
    );

    return {
      recipeId: row.recipeId,
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
      status: derivePinStatus({
        hasRecipe: Boolean(row.recipeInstructions),
        latestExtractionStatus: latestExtraction?.status,
        latestExtractionLowConfidence: latestExtraction?.lowConfidence,
        ingredientReviewCount: getIngredientReviewCount(
          row.recipeInstructions?.ingredients,
        ),
      }),
      dominantColor: row.pin.dominantColor,
      yieldText: row.recipeInstructions?.yieldText ?? null,
      prepTime: row.recipeInstructions?.prepTime ?? null,
      cookTime: row.recipeInstructions?.cookTime ?? null,
      totalTime: row.recipeInstructions?.totalTime ?? null,
      averageRating: aggregate.averageRating,
      reviewCount: aggregate.reviewCount,
      reviews,
      ingredients:
        row.recipeInstructions?.ingredients.map((ingredient) => ({
          id: ingredient.ingredientId,
          originalText: ingredient.originalText,
          displayText: ingredient.originalText,
          amount: ingredient.amountText,
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
      extractionSummary: latestExtraction
        ? `${latestExtraction.status.replaceAll("_", " ")}${latestExtraction.method ? ` via ${latestExtraction.method}` : ""}`
        : null,
    };
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
        return {
          recipeId: row.recipeId,
          pinId: row.pin.pinterestPinId,
          title:
            row.title ??
            row.pin.title ??
            row.recipeInstructions?.title ??
            "Untitled recipe",
          boardId: row.pin.pinterestBoardId,
          status: derivePinStatus({
            hasRecipe: Boolean(row.recipeInstructions),
            latestExtractionStatus: latestExtraction?.status,
            latestExtractionLowConfidence: latestExtraction?.lowConfidence,
            ingredientReviewCount: getIngredientReviewCount(
              row.recipeInstructions?.ingredients,
            ),
          }),
          updatedAt: row.updatedAt,
          imageUrl:
            row.imageUrl ??
            row.recipeInstructions?.imageUrl ??
            getPinImageUrl(row.pin.mediaJson, row.pin.rawJson),
          sourceUrl: row.recipeInstructions?.canonicalUrl ?? row.pin.link,
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
      where: (table, { eq }) => eq(table.householdId, context.householdId),
      orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
      limit: 10,
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

  return members.map((member) => ({
    clerkUserId: member.clerkUserId,
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
    const totalCount = (
      await db.query.householdRecipeIngredients.findMany({
        where: (table, { and, eq }) =>
          and(
            eq(table.householdId, context.householdId),
            eq(table.normalizationStatus, "needs_review"),
            recipeId ? eq(table.recipeId, recipeId) : undefined,
          ),
        columns: {
          ingredientId: true,
        },
      })
    ).length;
    const totalPages =
      totalCount === 0 ? 0 : Math.ceil(totalCount / normalizedPageSize);
    const currentPage =
      totalPages === 0
        ? 1
        : Math.min(Math.max(Math.trunc(page) || 1, 1), totalPages);
    const offset = (currentPage - 1) * normalizedPageSize;
    const rows = await db.query.householdRecipeIngredients
      .findMany({
        where: (table, { and, eq }) =>
          and(
            eq(table.householdId, context.householdId),
            eq(table.normalizationStatus, "needs_review"),
            recipeId ? eq(table.recipeId, recipeId) : undefined,
          ),
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
      const ingredientMatchScore = ingredientQuery
        ? getIngredientMatchScore(row, ingredientQuery)
        : 0;

      return {
        ...card,
        ingredientMatchScore,
        updatedAt: row.pin.updatedAt ?? "",
      };
    })
    .filter(
      (row) =>
        !normalizedQuery ||
        row.searchText.includes(normalizedQuery) ||
        row.ingredientMatchScore > 0,
    )
    .sort(compareFeedRows);
}

function compareFeedRows(left: FeedCardRow, right: FeedCardRow) {
  if (right.ingredientMatchScore !== left.ingredientMatchScore) {
    return right.ingredientMatchScore - left.ingredientMatchScore;
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
      ingredientMatchScore: row.ingredientMatchScore,
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
    && (Boolean(job.lastError) || isRecipeParseJobHeartbeatStale(job.status, job.lastHeartbeatAt));
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
      ? "Needs resume after a worker scheduling error"
      : "May be stalled. Resume to continue parsing";
  }

  if (input.status === "queued") {
    return "Queued";
  }

  if (input.status === "running") {
    return `Parsing ${input.processedRecipes} of ${input.totalRecipes}`;
  }

  if (input.status === "cancelling") {
    return "Finishing current chunk before cancelling";
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

function isRecipeParseJobHeartbeatStale(status: string, lastHeartbeatAt: string | null) {
  if (status !== "running" && status !== "cancelling") {
    return false;
  }

  if (!lastHeartbeatAt) {
    return true;
  }

  const heartbeatMs = new Date(lastHeartbeatAt).getTime();
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
      ingredientMatchScore?: unknown;
      averageRating?: unknown;
      updatedAt?: unknown;
      recipeId?: unknown;
    };

    if (
      typeof parsed.ingredientMatchScore !== "number"
      || (parsed.averageRating !== null && typeof parsed.averageRating !== "number")
      || typeof parsed.updatedAt !== "string"
      || typeof parsed.recipeId !== "string"
    ) {
      return null;
    }

    return {
      ingredientMatchScore: parsed.ingredientMatchScore,
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
    ingredientMatchScore: number;
    averageRating: number | null;
    updatedAt: string;
    recipeId: string;
  },
) {
  if (row.ingredientMatchScore !== cursor.ingredientMatchScore) {
    return row.ingredientMatchScore < cursor.ingredientMatchScore;
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
    ingredientMatchScore: number;
    averageRating: number | null;
    updatedAt: string;
    recipeId: string;
  },
) {
  return (
    row.ingredientMatchScore === cursor.ingredientMatchScore
    && row.averageRating === cursor.averageRating
    && row.updatedAt === cursor.updatedAt
    && row.recipeId === cursor.recipeId
  );
}

async function getFeedRecipeRows(db: DatabaseHandle, householdId: string) {
  return await db.query.householdRecipes
    .findMany({
      where: (table, { eq }) => eq(table.householdId, householdId),
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

function getIngredientMatchScore(
  row: RecipeGraph,
  query: Awaited<ReturnType<typeof resolveIngredientSearchQuery>>,
) {
  if (!query?.searchCanonicalIngredientIds.length) {
    return 0;
  }

  let bestScore = 0;

  for (const ingredient of row.recipeInstructions?.ingredients ?? []) {
    if (
      !ingredient.canonicalIngredientId ||
      !query.searchCanonicalIngredientIds.includes(
        ingredient.canonicalIngredientId,
      )
    ) {
      continue;
    }

    const ingredientAttributes = parseJsonArray(ingredient.attributesJson);
    const attributeMatch = query.attributes.every((attribute) =>
      ingredientAttributes.includes(attribute),
    );
    const exactCanonicalMatch =
      ingredient.canonicalIngredientId === query.canonicalIngredientId;
    const score = exactCanonicalMatch
      ? query.attributes.length === 0 || attributeMatch
        ? 4
        : 2
      : query.attributes.length === 0 || attributeMatch
        ? 3
        : 1;

    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
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
