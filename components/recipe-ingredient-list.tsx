"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatScaledIngredientParts,
  type ScalableIngredient,
} from "@/lib/ingredient-scaling";

type IngredientListProps = {
  ingredients: Array<ScalableIngredient & { id: string }>;
};

export function RecipeIngredientList({ ingredients }: IngredientListProps) {
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(1);

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
        {ingredients.map((ingredient) => (
          <li key={ingredient.id} className="flex items-start gap-3">
            {(() => {
              const parts = formatScaledIngredientParts(ingredient, multiplier);
              return parts.amount ? <span className="mt-0.5 shrink-0 rounded-lg bg-secondary px-2 py-1 text-sm font-semibold text-foreground">{parts.amount}</span> : null;
            })()}
            <p className="min-w-0 pt-1 font-medium text-foreground">
              {formatScaledIngredientParts(ingredient, multiplier).description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
