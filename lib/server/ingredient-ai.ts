import { z } from "zod";

import {
  generateIngredientParsesWithHouseholdAi,
  generateIngredientSuggestionsWithHouseholdAi,
} from "@/lib/server/ai-provider";
import type { DatabaseClient } from "@/src/db/client";
import type {
  CanonicalIngredientOption,
  IngredientReviewSuggestionView,
} from "@/types/view-models";

type IngredientAiCatalogEntry = CanonicalIngredientOption;

export type IngredientAiParseOutcome = "parsed" | "not_ingredient" | "unresolved";

export type IngredientAiParse = {
  ingredientId: string;
  outcome: IngredientAiParseOutcome;
  ingredientText: string | null;
  amountText: string | null;
  unit: string | null;
  notes: string | null;
  reason: string | null;
};

type IngredientAiRequest = {
  householdId: string;
  originalText: string;
  parsedIngredientText: string | null;
  normalizedIngredientPhrase: string;
  canonicalIngredients: IngredientAiCatalogEntry[];
};

const ingredientSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      action: z.enum(["match_existing", "create_new", "keep_unresolved"]),
      canonicalIngredientId: z.string().nullable().optional(),
      newCanonicalName: z.string().nullable().optional(),
      parentCanonicalIngredientId: z.string().nullable().optional(),
      ingredientKind: z.enum(["family", "base", "leaf"]).nullable().optional(),
      attributes: z.array(z.string()),
      confidence: z.number().int().min(0).max(100),
      reason: z.string(),
    }),
  ).min(1).max(3),
});

const ingredientParseSchema = z.object({
  results: z.array(z.discriminatedUnion("outcome", [
    z.object({
      ingredientId: z.string(),
      outcome: z.literal("parsed"),
      ingredientText: z.string().nullable(),
      amountText: z.string().nullable(),
      unit: z.string().nullable(),
      notes: z.string().nullable(),
      reason: z.string().nullable().optional(),
    }),
    z.object({
      ingredientId: z.string(),
      outcome: z.literal("not_ingredient"),
      ingredientText: z.string().nullable(),
      amountText: z.string().nullable(),
      unit: z.string().nullable(),
      notes: z.string().nullable(),
      reason: z.string().trim().min(1),
    }),
    z.object({
      ingredientId: z.string(),
      outcome: z.literal("unresolved"),
      ingredientText: z.string().nullable(),
      amountText: z.string().nullable(),
      unit: z.string().nullable(),
      notes: z.string().nullable(),
      reason: z.string().trim().min(1),
    }),
  ])).max(20),
});

export async function getIngredientAiParses(args: {
  householdId: string;
  ingredients: Array<{ ingredientId: string; originalText: string }>;
  database?: DatabaseClient;
}): Promise<IngredientAiParse[] | null> {
  if (args.ingredients.length === 0) {
    return [];
  }

  const parsed = await generateIngredientParsesWithHouseholdAi({
    householdId: args.householdId,
    database: args.database,
    schema: ingredientParseSchema,
    prompt: buildIngredientParsePrompt(args.ingredients),
  });

  const validated = ingredientParseSchema.safeParse(parsed);
  if (!validated.success) {
    return null;
  }

  const requestedIds = new Set(args.ingredients.map((ingredient) => ingredient.ingredientId));
  const seenIds = new Set<string>();

  return validated.data.results.flatMap((result) => {
    if (!requestedIds.has(result.ingredientId) || seenIds.has(result.ingredientId)) {
      return [];
    }

    seenIds.add(result.ingredientId);
    return [{
      ingredientId: result.ingredientId,
      outcome: result.outcome,
      ingredientText: cleanOptionalText(result.ingredientText),
      amountText: cleanOptionalText(result.amountText),
      unit: cleanOptionalText(result.unit),
      notes: cleanOptionalText(result.notes),
      reason: cleanOptionalText(result.reason ?? null),
    }];
  });
}

export async function getIngredientAiSuggestions(
  request: IngredientAiRequest,
): Promise<IngredientReviewSuggestionView[]> {
  const prompt = buildPrompt(request);
  const parsed = await generateIngredientSuggestionsWithHouseholdAi({
    householdId: request.householdId,
    prompt,
    schema: ingredientSuggestionSchema,
  });

  if (!parsed) {
    return [];
  }

  return validateSuggestions(parsed.suggestions, request.canonicalIngredients);
}

function buildPrompt(request: IngredientAiRequest) {
  const catalogSummary = request.canonicalIngredients
    .slice(0, 400)
    .map((ingredient) => [
      ingredient.canonicalIngredientId,
      ingredient.displayName,
      ingredient.ingredientKind,
      ingredient.parentDisplayName ? `parent=${ingredient.parentDisplayName}` : null,
    ]
      .filter(Boolean)
      .join(" | "))
    .join("\n");

  return [
    "You are helping normalize recipe ingredients into a kitchen ingredient catalog.",
    "Return 1 to 3 suggestions ranked best-first.",
    "Prefer matching an existing ingredient when it is clearly correct.",
    "Use action=create_new when the phrase is materially distinct and should become its own canonical ingredient.",
    "Use action=keep_unresolved only when none of the available options are trustworthy.",
    "Attributes should capture close qualifiers like light, dark, fresh, unsalted, red.",
    "If suggesting create_new, provide a parent canonical ingredient when an existing family ingredient is appropriate.",
    "Do not invent quantities or units.",
    "",
    `Original line: ${request.originalText}`,
    `Parsed ingredient text: ${request.parsedIngredientText ?? "unknown"}`,
    `Normalized phrase: ${request.normalizedIngredientPhrase}`,
    "",
    "Available canonical ingredients:",
    catalogSummary || "(none)",
  ].join("\n");
}

function buildIngredientParsePrompt(
  ingredients: Array<{ ingredientId: string; originalText: string }>,
) {
  return [
    "You extract recipe ingredient lines into a small, reviewable schema.",
    "Return exactly one result for every input ingredient ID, preserving that ID.",
    "For outcome=parsed, extract ingredientText, amountText, unit, and notes. Use null for fields that do not exist.",
    "Do not calculate numeric quantities, normalize units, match a catalog, or invent values.",
    "Use outcome=not_ingredient only when the line is not an ingredient. Give a concise reason that helps a human understand why.",
    "Use outcome=unresolved when the line is an ingredient-related instruction or format that cannot be faithfully represented by these fields. Give a concise reason describing what does not fit.",
    "Do not automatically reject anything; your outcome and reason are advisory feedback for a human reviewer.",
    "",
    "Input ingredients:",
    ...ingredients.map((ingredient) => `${ingredient.ingredientId} | ${ingredient.originalText}`),
  ].join("\n");
}

function cleanOptionalText(value: string | null) {
  const cleaned = value?.trim();
  return cleaned || null;
}

function validateSuggestions(
  rawSuggestions: Array<z.infer<typeof ingredientSuggestionSchema>["suggestions"][number]>,
  canonicalIngredients: IngredientAiCatalogEntry[],
): IngredientReviewSuggestionView[] {
  const byId = new Map(
    canonicalIngredients.map((ingredient) => [
      ingredient.canonicalIngredientId,
      ingredient,
    ]),
  );

  return rawSuggestions
    .map((suggestion) => {
      const canonicalIngredientId =
        suggestion.canonicalIngredientId && byId.has(suggestion.canonicalIngredientId)
          ? suggestion.canonicalIngredientId
          : null;
      const canonicalIngredient = canonicalIngredientId
        ? byId.get(canonicalIngredientId) ?? null
        : null;
      const parentCanonicalIngredientId =
        suggestion.parentCanonicalIngredientId &&
        byId.has(suggestion.parentCanonicalIngredientId)
          ? suggestion.parentCanonicalIngredientId
          : null;
      const parentCanonicalIngredient = parentCanonicalIngredientId
        ? byId.get(parentCanonicalIngredientId) ?? null
        : null;

      return {
        action: suggestion.action,
        canonicalIngredientId,
        canonicalName: canonicalIngredient?.displayName ?? null,
        newCanonicalName: suggestion.newCanonicalName?.trim() || null,
        parentCanonicalIngredientId,
        parentCanonicalName: parentCanonicalIngredient?.displayName ?? null,
        ingredientKind: suggestion.ingredientKind ?? null,
        attributes: suggestion.attributes,
        confidence: suggestion.confidence,
        reason: suggestion.reason.trim(),
      } satisfies IngredientReviewSuggestionView;
    })
    .sort((left, right) => right.confidence - left.confidence);
}
