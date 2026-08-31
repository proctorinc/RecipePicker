"use client";

import { AlertTriangle } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IngredientReviewDialog } from "@/components/ingredient-review-table";
import {
  formatScaledIngredientParts,
  type ScalableIngredient,
} from "@/lib/ingredient-scaling";
import type { IngredientReviewItemView } from "@/types/view-models";

type IngredientListProps = {
  ingredients: Array<ScalableIngredient & {
    id: string;
    originalText: string;
    normalizationStatus?: "auto_matched" | "needs_review" | "confirmed";
  }>;
  recipeId?: string;
  recipeTitle?: string;
  sourceUrl?: string | null;
};

export function RecipeIngredientList({
  ingredients,
  recipeId,
  recipeTitle,
  sourceUrl,
}: IngredientListProps) {
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(1);
  const [reviewingIngredient, setReviewingIngredient] = useState<IngredientListProps["ingredients"][number] | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const reviewItem: IngredientReviewItemView | null = reviewingIngredient && recipeId && recipeTitle
    ? {
        ingredientId: reviewingIngredient.id,
        recipeId,
        recipeTitle,
        originalText: reviewingIngredient.originalText,
        measurements: (reviewingIngredient.measurements ?? []).map((measurement, index) => ({ id: `recipe-measurement-${index}`, ...measurement })),
        amountText: reviewingIngredient.amount ?? null,
        unit: reviewingIngredient.unit ?? null,
        notes: reviewingIngredient.notes ?? null,
        parsedIngredientText: reviewingIngredient.parsedText ?? null,
        normalizedIngredientPhrase: null,
        suggestedCanonicalIngredientId: null,
        suggestedCanonicalName: null,
        suggestedParentCanonicalIngredientId: null,
        suggestedParentCanonicalName: null,
        suggestedAction: "keep_unresolved",
        suggestedIngredientKind: null,
        suggestedAttributes: [],
        matchConfidence: null,
        matchedBy: null,
        aiSuggestions: [],
        aiParseOutcome: null,
        aiParseReason: null,
        occurrenceCount: 1,
        sourceUrl: sourceUrl ?? null,
      }
    : null;

  return (
    <div>
      <div
        className="mb-5 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Scale ingredients"
      >
        {([1, 2, 3] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={multiplier === value ? "default" : "outline"}
            aria-pressed={multiplier === value}
            onClick={() => setMultiplier(value)}
          >
            {value}×
          </Button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        Ingredient scale set to {multiplier}×.
      </p>
      <ul className="space-y-3">
        {ingredients.map((ingredient) => {
          const needsReview = ingredient.normalizationStatus === "needs_review";
          return (
          <li
            key={ingredient.id}
            className={`flex items-start gap-3 rounded-2xl ${needsReview ? "border border-yellow-400/60 bg-yellow-100/65 p-3" : ""}`}
          >
            <span aria-hidden="true" className="mt-1.5 shrink-0 text-muted-foreground">
              •
            </span>
            {(() => {
              const parts = formatScaledIngredientParts(ingredient, multiplier);
              return parts.amount ? <span className="mt-0.5 shrink-0 rounded-lg bg-secondary px-2 py-1 text-sm font-semibold text-foreground">{parts.amount}</span> : null;
            })()}
            <div className="min-w-0 flex-1">
              <p className="pt-1 font-medium text-foreground">
                {formatScaledIngredientParts(ingredient, multiplier).description}
              </p>
              {needsReview && recipeId && recipeTitle ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 -ml-2 text-yellow-900 hover:bg-yellow-200/70 hover:text-yellow-950"
                  onClick={() => setReviewingIngredient(ingredient)}
                >
                  <Icon icon={AlertTriangle} size="sm" />
                  Needs review
                </Button>
              ) : null}
            </div>
          </li>
          );
        })}
      </ul>
      <IngredientReviewDialog
        item={reviewItem}
        open={Boolean(reviewingIngredient)}
        onOpenChange={(open) => { if (!open) setReviewingIngredient(null); }}
        onDone={() => {
          setReviewingIngredient(null);
          startTransition(() => router.refresh());
        }}
      />
    </div>
  );
}
