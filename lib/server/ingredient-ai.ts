import { z } from "zod";

import { generateIngredientSuggestionsWithHouseholdAi } from "@/lib/server/ai-provider";
import type {
  CanonicalIngredientOption,
  IngredientReviewSuggestionView,
} from "@/types/view-models";

type IngredientAiCatalogEntry = CanonicalIngredientOption;

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
    "You are helping normalize recipe ingredients into a household ingredient catalog.",
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
