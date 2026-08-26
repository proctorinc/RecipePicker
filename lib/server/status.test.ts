import { describe, expect, it } from "vitest";

import { derivePinStatus, formatStatusLabel } from "@/lib/server/status";

describe("derivePinStatus", () => {
  it("prefers a persisted recipe over extraction history", () => {
    expect(
      derivePinStatus({
        hasRecipe: true,
        latestExtractionStatus: "extraction_failed",
      }),
    ).toBe("recipe_ready");
  });

  it("surfaces ingredient review work even after extraction succeeded", () => {
    expect(
      derivePinStatus({
        hasRecipe: true,
        latestExtractionStatus: "recipe_extracted",
        ingredientReviewCount: 2,
      }),
    ).toBe("needs_review");
  });

  it("maps review-needed extractions", () => {
    expect(
      derivePinStatus({
        hasRecipe: false,
        latestExtractionStatus: "multiple_recipes_needs_review",
      }),
    ).toBe("needs_review");
  });

  it("defaults to not extracted when there is no extraction history", () => {
    expect(
      derivePinStatus({
        hasRecipe: false,
        latestExtractionStatus: null,
      }),
    ).toBe("not_extracted");
  });

  it("marks a reconciled Pinterest deletion as removed", () => {
    expect(derivePinStatus({
      removedAt: "2026-08-25T00:00:00.000Z",
      hasRecipe: true,
      latestExtractionStatus: "recipe_extracted",
    })).toBe("removed");
  });
});

describe("formatStatusLabel", () => {
  it("formats readable labels", () => {
    expect(formatStatusLabel("recipe_ready")).toBe("Ready");
    expect(formatStatusLabel("not_recipe")).toBe("Not a recipe");
    expect(formatStatusLabel("removed")).toBe("Removed");
  });
});
