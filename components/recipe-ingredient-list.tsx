"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatScaledIngredient, type ScalableIngredient } from "@/lib/ingredient-scaling";

type IngredientListProps = {
  ingredients: Array<ScalableIngredient & { id: string }>;
};

export function RecipeIngredientList({ ingredients }: IngredientListProps) {
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(1);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Scale ingredients">
        <span className="mr-1 text-sm font-medium text-muted-foreground">Scale ingredients</span>
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
      <p className="sr-only" aria-live="polite">Ingredient scale set to {multiplier}×.</p>
      <ul className="space-y-3">
        {ingredients.map((ingredient) => (
          <li key={ingredient.id} className="list-disc">
            <p className="font-medium text-foreground">
              {formatScaledIngredient(ingredient, multiplier)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
