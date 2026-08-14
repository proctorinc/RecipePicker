import { NextResponse } from "next/server";

import { requireHouseholdContext } from "@/lib/server/auth";
import { extractRecipeWithFallbacks } from "@/lib/server/recipe-parser";

export async function POST(request: Request) {
  let sourceUrl = "";
  try {
    const body = await request.json() as { url?: unknown };
    sourceUrl = typeof body.url === "string" ? body.url.trim() : "";
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
  } catch {
    return NextResponse.json({ message: "Enter a valid recipe URL." }, { status: 400 });
  }

  try {
    const context = await requireHouseholdContext();
    const result = await extractRecipeWithFallbacks(sourceUrl, {
      householdId: context.householdId,
    });
    if (!result.recipe) {
      return NextResponse.json({
        message: result.failureReason || "We could not find a structured recipe at that URL.",
      }, { status: 422 });
    }

    return NextResponse.json({
      title: result.recipe.title ?? "",
      description: result.recipe.description ?? "",
      imageUrl: result.recipe.imageUrl ?? "",
      sourceUrl: result.recipe.canonicalUrl ?? sourceUrl,
      yieldText: result.recipe.yieldText ?? "",
      prepTime: result.recipe.prepTime ?? "",
      cookTime: result.recipe.cookTime ?? "",
      totalTime: result.recipe.totalTime ?? "",
      ingredients: result.recipe.ingredients.map((ingredient) => ingredient.originalText),
      steps: result.recipe.steps.map((step) => step.text),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import that recipe.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
