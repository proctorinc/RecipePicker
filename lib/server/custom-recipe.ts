import { put } from "@vercel/blob";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { openDatabase } from "@/lib/server/database";
import {
  boardSyncSubscriptions,
  householdBoards,
  householdPins,
  householdRecipeIngredients,
  householdRecipeInstructions,
  householdRecipes,
  householdRecipeSteps,
  pinterestAccounts,
} from "@/lib/server/db";
import { createPinterestPin, getValidPinterestAccessToken } from "@/lib/server/pinterest";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type CustomRecipeInput = {
  householdId: string;
  boardId: string | null;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  yieldText: string | null;
  prepTime: string | null;
  cookTime: string | null;
  totalTime: string | null;
  ingredients: string[];
  steps: string[];
  imageFile?: File | null;
  imageUrl?: string | null;
};

export async function createCustomRecipe(input: CustomRecipeInput) {
  const image = await resolveRecipeImage(input.imageFile, input.imageUrl);
  const { db, sqlite } = await openDatabase();

  try {
    const recipeId = createId();
    const now = new Date().toISOString();
    const isPublishing = Boolean(input.boardId);
    const subscription = isPublishing ? await db.query.boardSyncSubscriptions.findFirst({
      where: (table, { and, eq }) => and(
        eq(table.householdId, input.householdId),
        eq(table.pinterestBoardId, input.boardId!),
        eq(table.syncEnabled, true),
      ),
    }) : null;
    const board = isPublishing ? await db.query.householdBoards.findFirst({
      where: (table, { and, eq }) => and(
        eq(table.householdId, input.householdId),
        eq(table.pinterestBoardId, input.boardId!),
      ),
    }) : null;
 
    if (isPublishing && (!subscription || !board)) {
      throw new Error("Choose a Pinterest board that is enabled for sync.");
    }
    const connection = isPublishing ? await db.query.pinterestAccounts.findFirst({
      where: (table, { and, eq }) => and(
        eq(table.householdId, input.householdId),
        eq(table.provider, "pinterest"),
        eq(table.connectionStatus, "active"),
      ),
      columns: { scope: true },
    }) : null;
    const scopes = new Set(connection?.scope?.split(",").map((scope) => scope.trim()) ?? []);
    if (isPublishing && (!scopes.has("pins:write") || !scopes.has("boards:read"))) {
      throw new Error("Pinterest must be reconnected with publishing permission.");
    }

    const publishedPin = isPublishing ? await createPinterestPin({
      boardId: input.boardId!, title: input.title, description: input.description,
      link: input.sourceUrl, imageBase64: image.bytes.toString("base64"), contentType: image.contentType,
    }, await getValidPinterestAccessToken(input.householdId)) : null;
    if (isPublishing && !publishedPin?.id) throw new Error("Pinterest did not return an ID for the new Pin.");

    const personalBoardId = `personal:${input.householdId}`;
    const resolvedBoardId = board?.boardId ?? personalBoardId;
    const resolvedPinterestBoardId = input.boardId ?? personalBoardId;
    const pinId = publishedPin ? `pinterest:${input.householdId}:${publishedPin.id}` : `personal:${input.householdId}:${recipeId}`;
    if (!board) {
      await db.insert(householdBoards).values({
        boardId: personalBoardId,
        householdId: input.householdId,
        pinterestBoardId: personalBoardId,
        name: "Personal recipes",
        description: null,
        privacy: null,
        ownerJson: null,
        rawJson: JSON.stringify({ id: personalBoardId, source: "personal_recipes" }),
        syncEnabled: false,
        lastSyncedAt: now,
      }).onConflictDoNothing().run();
    }
    const rawRecipe = {
      source: input.sourceUrl ? "url_import" : "manual",
      createdInApp: true,
    };

    // Drizzle exposes incompatible sync/async transaction overloads on the
    // union database client, but both drivers accept this callback contract.
    const transactionDb = db as unknown as {
      transaction: (callback: (transaction: typeof db) => Promise<void>) => Promise<void>;
    };
    await transactionDb.transaction(async (tx) => {
      await tx.insert(householdPins).values({
        pinId,
        householdId: input.householdId,
        pinterestPinId: publishedPin?.id ?? `personal:${recipeId}`,
        boardId: resolvedBoardId,
        pinterestBoardId: resolvedPinterestBoardId,
        boardSectionId: publishedPin?.board_section_id ?? null,
        title: input.title,
        description: input.description,
        link: input.sourceUrl,
        altText: input.title,
        dominantColor: publishedPin?.dominant_color ?? null,
        note: null,
        createdAt: publishedPin?.created_at ?? now,
        parentPinId: null,
        mediaJson: publishedPin?.media ? JSON.stringify(publishedPin.media) : null,
        mediaSourceJson: null,
        creatorJson: publishedPin?.creator ? JSON.stringify(publishedPin.creator) : null,
        boardOwnerJson: publishedPin?.board_owner ? JSON.stringify(publishedPin.board_owner) : null,
        rawJson: JSON.stringify(publishedPin ?? { id: `personal:${recipeId}`, createdInApp: true }),
        updatedAt: now,
      }).run();

      await tx.insert(householdRecipes).values({
        recipeId,
        householdId: input.householdId,
        pinId,
        title: input.title,
        description: input.description,
        imageUrl: image.url,
        titleOverridden: true,
        descriptionOverridden: true,
        imageUrlOverridden: true,
        createdAt: now,
        updatedAt: now,
      }).run();

      await tx.insert(householdRecipeInstructions).values({
        recipeId,
        householdId: input.householdId,
        sourceId: null,
        title: input.title,
        description: input.description,
        author: null,
        canonicalUrl: input.sourceUrl,
        siteName: input.sourceUrl ? new URL(input.sourceUrl).hostname : null,
        imageUrl: image.url,
        yieldText: input.yieldText,
        prepTime: input.prepTime,
        cookTime: input.cookTime,
        totalTime: input.totalTime,
        categoriesJson: "[]",
        cuisine: null,
        keywordsJson: "[]",
        nutritionJson: null,
        rawRecipeJson: JSON.stringify(rawRecipe),
        createdAt: now,
        updatedAt: now,
      }).run();

      for (const [position, originalText] of input.ingredients.entries()) {
        await tx.insert(householdRecipeIngredients).values({
          householdId: input.householdId,
          recipeId,
          position,
          originalText,
          amountText: null,
          amountValue: null,
          amountMaxValue: null,
          unit: null,
          ingredientText: null,
          notes: null,
          normalizedIngredientPhrase: null,
          canonicalIngredientId: null,
          attributesJson: "[]",
          matchConfidence: null,
          matchedBy: "manual_entry",
          aiSuggestionsJson: null,
          normalizationStatus: "needs_review",
        }).run();
      }

      for (const [position, text] of input.steps.entries()) {
        await tx.insert(householdRecipeSteps).values({
          householdId: input.householdId,
          recipeId,
          position,
          section: null,
          rawText: text,
          text,
        }).run();
      }
    });
    return { recipeId };
  } finally {
    await sqlite.close();
  }
}

export async function publishPersonalRecipe(args: {
  householdId: string;
  recipeId: string;
  boardId: string;
}) {
  const { db, sqlite } = await openDatabase();
  try {
    const recipe = await db.query.householdRecipes.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, args.householdId), eq(table.recipeId, args.recipeId)),
      with: { pin: true, recipeInstructions: { with: { ingredients: true, steps: true } } },
    });
    const board = await db.query.householdBoards.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, args.householdId), eq(table.pinterestBoardId, args.boardId)),
    });
    const subscription = await db.query.boardSyncSubscriptions.findFirst({
      where: (table, { and, eq }) => and(eq(table.householdId, args.householdId), eq(table.pinterestBoardId, args.boardId), eq(table.syncEnabled, true)),
    });
    const connection = await db.query.pinterestAccounts.findFirst({
      where: (table, { and, eq }) => and(
        eq(table.householdId, args.householdId),
        eq(table.provider, "pinterest"),
        eq(table.connectionStatus, "active"),
      ),
      columns: { scope: true },
    });
    const scopes = new Set(connection?.scope?.split(",").map((scope) => scope.trim()) ?? []);
    if (!scopes.has("pins:write") || !scopes.has("boards:read")) {
      throw new Error("Pinterest must be reconnected with publishing permission.");
    }
    if (!recipe || !recipe.pin || !recipe.recipeInstructions || !recipe.imageUrl || !board || !subscription) {
      throw new Error("This recipe or Pinterest board is unavailable for publishing.");
    }
    if (!recipe.pin.pinterestPinId.startsWith("personal:")) {
      throw new Error("This recipe is already published to Pinterest.");
    }
    const image = await resolveRecipeImage(null, recipe.imageUrl);
    const publishedPin = await createPinterestPin({
      boardId: args.boardId,
      title: recipe.title || recipe.recipeInstructions.title || "Untitled recipe",
      description: recipe.description || recipe.recipeInstructions.description,
      link: recipe.recipeInstructions.canonicalUrl,
      imageBase64: image.bytes.toString("base64"),
      contentType: image.contentType,
    }, await getValidPinterestAccessToken(args.householdId));
    if (!publishedPin.id) throw new Error("Pinterest did not return an ID for the new Pin.");
    await db.update(householdPins).set({
      pinterestPinId: publishedPin.id,
      boardId: board.boardId,
      pinterestBoardId: args.boardId,
      boardSectionId: publishedPin.board_section_id ?? null,
      createdAt: publishedPin.created_at ?? recipe.pin.createdAt,
      mediaJson: publishedPin.media ? JSON.stringify(publishedPin.media) : null,
      creatorJson: publishedPin.creator ? JSON.stringify(publishedPin.creator) : null,
      boardOwnerJson: publishedPin.board_owner ? JSON.stringify(publishedPin.board_owner) : null,
      rawJson: JSON.stringify(publishedPin),
      updatedAt: new Date().toISOString(),
    }).where(eq(householdPins.pinId, recipe.pinId)).run();
    return { recipeId: recipe.recipeId };
  } finally {
    await sqlite.close();
  }
}

async function resolveRecipeImage(file?: File | null, remoteUrl?: string | null) {
  let bytes: Buffer;
  let contentType: string;
  let extension: string;

  if (file && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES || !ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error("Use a JPG, PNG, or WebP image no larger than 10 MB.");
    }
    bytes = Buffer.from(await file.arrayBuffer());
    contentType = file.type;
    extension = extensionFor(contentType);
  } else if (remoteUrl) {
    const parsed = new URL(remoteUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("The imported recipe image must use an HTTP(S) URL.");
    }
    const response = await fetch(parsed, { signal: AbortSignal.timeout(15_000) });
    contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!response.ok || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new Error("The imported recipe image must be a JPG, PNG, or WebP file.");
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("The imported recipe image is larger than 10 MB.");
    }
    bytes = Buffer.from(body);
    extension = extensionFor(contentType);
  } else {
    throw new Error("Add a recipe image before publishing.");
  }

  const blob = await put(`recipes/${createId()}.${extension}`, bytes, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  return { bytes, contentType, url: blob.url };
}

function extensionFor(contentType: string) {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}
