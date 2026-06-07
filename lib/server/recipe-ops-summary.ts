import type { PinStatus } from "@/types/view-models";

type RecipeOpsSummaryInput = {
  status: PinStatus;
  hasRecipeContent: boolean;
  latestExtractionStatus: string | null;
  latestFailureReason: string | null;
  latestLowConfidence: boolean;
  ingredientReviewCount: number;
  latestWarnings: string[];
};

export type RecipeOpsSummary = {
  plainLanguageStatus: string;
  actionableIssues: string[];
  recommendedNextStep: string;
  latestAttentionReason: string | null;
};

export function summarizeRecipeOps(input: RecipeOpsSummaryInput): RecipeOpsSummary {
  const actionableIssues: string[] = [];

  if (input.latestLowConfidence) {
    actionableIssues.push("The latest extraction was marked low confidence and should be reviewed by a person.");
  }

  if (input.latestExtractionStatus === "multiple_recipes_needs_review") {
    actionableIssues.push("The parser found more than one possible recipe and needs help choosing the right one.");
  }

  if (input.ingredientReviewCount > 0) {
    actionableIssues.push(
      `${input.ingredientReviewCount} ingredient${input.ingredientReviewCount === 1 ? "" : "s"} still need manual review.`,
    );
  }

  if (input.status === "extraction_failed") {
    actionableIssues.push(input.latestFailureReason ?? "The latest extraction failed before usable recipe content was saved.");
  }

  if (input.latestWarnings.length > 0) {
    actionableIssues.push(
      `${input.latestWarnings.length} warning${input.latestWarnings.length === 1 ? "" : "s"} were recorded on the latest run.`,
    );
  }

  switch (input.status) {
    case "recipe_ready":
      return {
        plainLanguageStatus: input.hasRecipeContent
          ? "This recipe is usable now. You can fine-tune the content or leave guidance for better future runs."
          : "A recipe record exists, but it still needs a quick human sanity check.",
        actionableIssues,
        recommendedNextStep: actionableIssues.length > 0
          ? "Review and edit the recipe content, then leave any notes that would help the next run."
          : "Nothing is blocked right now. Optional cleanup and feedback can still improve future runs.",
        latestAttentionReason: actionableIssues[0] ?? null,
      };
    case "needs_review":
      return {
        plainLanguageStatus: "This recipe needs a human review before you can trust the extracted result.",
        actionableIssues,
        recommendedNextStep: input.hasRecipeContent
          ? "Review and edit the recipe content, then leave notes about what was wrong."
          : "Leave feedback about what went wrong, then re-run parsing after saving your notes.",
        latestAttentionReason: actionableIssues[0] ?? "The latest run needs manual review.",
      };
    case "extraction_failed":
      return {
        plainLanguageStatus: "The latest parsing run failed, so the app needs your note about what went wrong.",
        actionableIssues,
        recommendedNextStep: "Leave a note about why this failed, then re-run parsing when you are ready.",
        latestAttentionReason: actionableIssues[0] ?? "The latest extraction failed.",
      };
    case "not_recipe":
      return {
        plainLanguageStatus: "This source currently looks like a non-recipe page, which is a valid parsing outcome rather than a broken run.",
        actionableIssues,
        recommendedNextStep: "Review the preview and source context to confirm whether this should stay marked as not a recipe.",
        latestAttentionReason: actionableIssues[0] ?? "The parser did not find recipe content on this page.",
      };
    case "not_extracted":
    default:
      return {
        plainLanguageStatus: "This recipe has not been turned into structured content yet.",
        actionableIssues,
        recommendedNextStep: "Run parsing, then review the result here.",
        latestAttentionReason: actionableIssues[0] ?? null,
      };
  }
}
