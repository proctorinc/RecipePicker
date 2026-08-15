"use client";

import { useContext, useEffect, useState, type ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecipeIngredientList } from "@/components/recipe-ingredient-list";
import { RecipeEditingContext } from "@/components/recipe-metadata-editor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatIso8601Duration } from "@/lib/utils";
import type { PublicRecipeDetailView } from "@/types/view-models";

type RecipeContentProps = {
  recipe: PublicRecipeDetailView;
  emptyIngredients?: ReactNode;
  emptySteps?: ReactNode;
  showEmptySteps?: boolean;
};

export function RecipeContent({
  recipe,
  emptyIngredients = <UnavailableContent />,
  emptySteps = <UnavailableContent />,
  showEmptySteps = true,
}: RecipeContentProps) {
  const isEditing = useContext(RecipeEditingContext);
  const [ingredients, setIngredients] = useState(recipe.ingredients);
  const [steps, setSteps] = useState(recipe.steps);

  useEffect(() => {
    setIngredients(recipe.ingredients);
    setSteps(recipe.steps);
  }, [recipe.ingredients, recipe.steps]);

  const detailItems = [
    { label: "Total time", value: formatIso8601Duration(recipe.totalTime) },
    { label: "Prep time", value: formatIso8601Duration(recipe.prepTime) },
    { label: "Cook time", value: formatIso8601Duration(recipe.cookTime) },
    { label: "Servings", value: recipe.yieldText },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        {detailItems.length > 0 ? (
          <Card className="bg-white/85">
            <CardHeader><CardTitle>Recipe details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {detailItems.map((item) => (
                  <div key={item.label} className="rounded-[20px] bg-secondary/35 px-4 py-3">
                    <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</dt>
                    <dd className="mt-1 text-base font-medium text-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : null}

        <Card className="bg-white/85">
          <CardHeader><CardTitle>Ingredients</CardTitle></CardHeader>
          <CardContent className="px-10">
            {ingredients.length > 0 ? (
              isEditing ? (
                <section className="space-y-3">
                  <input type="hidden" name="ingredientsJson" value={JSON.stringify(ingredients.map(({ id, originalText, notes }) => ({ id, originalText, notes })))} />
                  {ingredients.map((ingredient, index) => (
                    <label key={ingredient.id} className="block space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Ingredient {index + 1}</span>
                      <Input
                        value={ingredient.originalText}
                        onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, originalText: event.target.value } : item))}
                        aria-label={`Ingredient ${index + 1}`}
                      />
                    </label>
                  ))}
                </section>
              ) : <RecipeIngredientList ingredients={ingredients} />
            ) : emptyIngredients}
          </CardContent>
        </Card>
      </div>

      {(recipe.steps.length > 0 || showEmptySteps) ? <Card className="bg-white/85">
        <CardHeader><CardTitle>Recipe</CardTitle></CardHeader>
        <CardContent>
          {steps.length > 0 ? (
            isEditing ? (
              <section className="space-y-4">
                <input type="hidden" name="stepsJson" value={JSON.stringify(steps)} />
                {steps.map((step, index) => (
                  <label key={step.id} className="block space-y-2 rounded-[24px] bg-secondary/40 p-4">
                    <span className="text-sm font-medium">Step {index + 1}</span>
                    <Textarea
                      value={step.text}
                      onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, text: event.target.value } : item))}
                      aria-label={`Step ${index + 1}`}
                      className="min-h-32 bg-white"
                    />
                  </label>
                ))}
              </section>
            ) : (
            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step.id} className="flex gap-4 rounded-[24px] bg-secondary/40 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold shadow-sm">{index + 1}</div>
                  <div>
                    {step.section ? <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">{step.section}</p> : null}
                    <p className="leading-7">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            )
          ) : emptySteps}
        </CardContent>
      </Card> : null}
    </div>
  );
}

function UnavailableContent() {
  return <p className="text-sm text-muted-foreground">Recipe content is not available yet.</p>;
}
