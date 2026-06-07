import { describe, expect, it } from "vitest";

import { summarizeRecipeOps } from "@/lib/server/recipe-ops-summary";

describe("summarizeRecipeOps", () => {
  it("explains low-confidence review work in plain language", () => {
    const summary = summarizeRecipeOps({
      status: "needs_review",
      hasRecipeContent: true,
      latestExtractionStatus: "recipe_extracted",
      latestFailureReason: null,
      latestLowConfidence: true,
      ingredientReviewCount: 2,
      latestWarnings: ["Missing total time"],
    });

    expect(summary.plainLanguageStatus).toContain("needs a human review");
    expect(summary.actionableIssues).toContain(
      "The latest extraction was marked low confidence and should be reviewed by a person.",
    );
    expect(summary.actionableIssues).toContain("2 ingredients still need manual review.");
  });

  it("gives a failure-focused next step when no recipe content exists", () => {
    const summary = summarizeRecipeOps({
      status: "extraction_failed",
      hasRecipeContent: false,
      latestExtractionStatus: "extraction_failed",
      latestFailureReason: "Paywalled source content blocked extraction.",
      latestLowConfidence: false,
      ingredientReviewCount: 0,
      latestWarnings: [],
    });

    expect(summary.plainLanguageStatus).toContain("failed");
    expect(summary.recommendedNextStep).toContain("Leave a note about why this failed");
    expect(summary.latestAttentionReason).toBe("Paywalled source content blocked extraction.");
  });

  it("keeps ready recipes understandable when feedback is optional", () => {
    const summary = summarizeRecipeOps({
      status: "recipe_ready",
      hasRecipeContent: true,
      latestExtractionStatus: "recipe_extracted",
      latestFailureReason: null,
      latestLowConfidence: false,
      ingredientReviewCount: 0,
      latestWarnings: [],
    });

    expect(summary.plainLanguageStatus).toContain("usable now");
    expect(summary.recommendedNextStep).toContain("Nothing is blocked right now");
    expect(summary.actionableIssues).toHaveLength(0);
  });
});
