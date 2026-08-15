import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recognize: vi.fn(),
  textExtraction: vi.fn(),
  videoExtraction: vi.fn(),
}));

vi.mock("tesseract.js", () => ({ default: { recognize: mocks.recognize } }));
vi.mock("@/lib/server/ai-provider", () => ({
  generateRecipeExtractionWithHouseholdAi: mocks.textExtraction,
  generateVideoRecipeExtractionWithHouseholdAi: mocks.videoExtraction,
}));

import { extractRecipeWithFallbacks } from "@/src/recipe-extraction";

const parsedRecipe = {
  title: "Weeknight pasta",
  description: null,
  author: null,
  yieldText: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  ingredients: ["1 pound pasta", "2 tablespoons olive oil"],
  steps: ["Boil the pasta until tender.", "Toss with olive oil and serve."],
};

describe("recipe media fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.textExtraction.mockResolvedValue(parsedRecipe);
    mocks.videoExtraction.mockResolvedValue({ object: parsedRecipe, provider: "google" });
  });

  it("uses labeled Pinterest text when no linked page exists", async () => {
    const result = await extractRecipeWithFallbacks(null, {
      householdId: "household-1",
      pinterestPin: { title: "Pasta", description: "Ingredients: pasta and olive oil. Cook, toss, and serve." },
    });

    expect(result.contentVariant).toBe("pinterest_description");
    expect(result.recipe?.title).toBe("Weeknight pasta");
    expect(mocks.textExtraction.mock.calls[0]?.[0].prompt).toContain("Description:");
  });

  it("uses OCR text from a pin image after text fallback fails", async () => {
    mocks.textExtraction.mockResolvedValueOnce(null).mockResolvedValueOnce(parsedRecipe);
    mocks.recognize.mockResolvedValue({ data: { text: "1 pound pasta\n2 tablespoons olive oil\nBoil pasta\nToss and serve" } });
    const result = await extractRecipeWithFallbacks(null, {
      householdId: "household-1",
      pinterestPin: { description: "Just a photo", mediaJson: JSON.stringify({ images: { orig: { url: "https://images.example.com/recipe.jpg" } } }) },
    });

    expect(result.contentVariant).toBe("pin_image_ocr");
    expect(mocks.recognize).toHaveBeenCalledWith("https://images.example.com/recipe.jpg", "eng");
  });

  it("asks Gemini to analyze both video visuals and narration", async () => {
    const result = await extractRecipeWithFallbacks(null, {
      householdId: "household-1",
      pinterestPin: { rawJson: JSON.stringify({ video_url: "https://video.example.com/recipe.mp4" }) },
    });

    expect(result.contentVariant).toBe("pinterest_video");
    expect(mocks.videoExtraction.mock.calls[0]?.[0].prompt).toContain("spoken narration/audio");
    expect(result.payload).toMatchObject({ analyzedModalities: ["visual", "audio"] });
  });
});
