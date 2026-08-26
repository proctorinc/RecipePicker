import type { PinStatus } from "@/types/view-models";

export function derivePinStatus(input: {
  removedAt?: string | null | undefined;
  hasRecipe: boolean;
  latestExtractionStatus: string | null | undefined;
  latestExtractionLowConfidence?: boolean | null | undefined;
  ingredientReviewCount?: number | null | undefined;
}): PinStatus {
  if (input.removedAt) {
    return "removed";
  }
  if (input.hasRecipe) {
    if ((input.ingredientReviewCount ?? 0) > 0 || Boolean(input.latestExtractionLowConfidence)) {
      return "needs_review";
    }

    return "recipe_ready";
  }

  switch (input.latestExtractionStatus) {
    case "multiple_recipes_needs_review":
      return "needs_review";
    case "not_recipe":
    case "unsupported_page":
      return "not_recipe";
    case "extraction_failed":
      return "extraction_failed";
    default:
      return input.latestExtractionLowConfidence ? "needs_review" : "not_extracted";
  }
}

export function formatStatusLabel(status: PinStatus) {
  switch (status) {
    case "recipe_ready":
      return "Ready";
    case "not_extracted":
      return "Pending";
    case "extraction_failed":
      return "Failed";
    case "needs_review":
      return "Needs review";
    case "not_recipe":
      return "Not a recipe";
    case "removed":
      return "Removed";
  }
}

export function statusTone(status: PinStatus): "success" | "secondary" | "destructive" | "warning" | "outline" {
  switch (status) {
    case "recipe_ready":
      return "success";
    case "not_extracted":
      return "secondary";
    case "extraction_failed":
      return "destructive";
    case "needs_review":
      return "warning";
    case "not_recipe":
      return "outline";
    case "removed":
      return "secondary";
  }
}
