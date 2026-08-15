"use client";

import { useContext, useEffect, useState, type DragEvent, type ReactNode } from "react";
import { GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  const { isEditing, formId, contentResetVersion, setHasContentChanges } = useContext(RecipeEditingContext);
  const [ingredients, setIngredients] = useState<Array<RecipeIngredientDraft>>(recipe.ingredients);
  const [steps, setSteps] = useState<Array<RecipeStepDraft>>(recipe.steps);
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);

  useEffect(() => {
    setIngredients(recipe.ingredients);
    setSteps(recipe.steps);
  }, [contentResetVersion, recipe.ingredients, recipe.steps]);

  useEffect(() => {
    const ingredientsChanged = JSON.stringify(ingredients.map(({ id, originalText, notes, isPendingDeletion }) => ({ id, originalText, notes, isPendingDeletion })))
      !== JSON.stringify(recipe.ingredients.map(({ id, originalText, notes }) => ({ id, originalText, notes })));
    const stepsChanged = JSON.stringify(steps.map(({ id, section, text, isPendingDeletion }) => ({ id, section, text, isPendingDeletion })))
      !== JSON.stringify(recipe.steps.map(({ id, section, text }) => ({ id, section, text })));

    setHasContentChanges(isEditing && (ingredientsChanged || stepsChanged));
  }, [ingredients, isEditing, recipe.ingredients, recipe.steps, setHasContentChanges, steps]);

  const detailItems = [
    { label: "Total time", value: formatIso8601Duration(recipe.totalTime) },
    { label: "Prep time", value: formatIso8601Duration(recipe.prepTime) },
    { label: "Cook time", value: formatIso8601Duration(recipe.cookTime) },
    { label: "Servings", value: recipe.yieldText },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  function addIngredient() {
    setIngredients((current) => [...current, {
      id: createDraftId(), originalText: "", displayText: "", amount: null,
      amountValue: null, amountMaxValue: null, unit: null, parsedText: null, notes: null,
      canonicalIngredientId: null, canonicalName: null, attributes: [], normalizationStatus: "needs_review",
    }]);
  }

  function addStep() {
    setSteps((current) => [...current, { id: createDraftId(), section: null, text: "" }]);
  }

  function moveStep(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    setSteps((current) => {
      const fromIndex = current.findIndex((step) => step.id === draggedId);
      const toIndex = current.findIndex((step) => step.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

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
            {isEditing ? (
              <section className="space-y-3">
                <input form={formId} type="hidden" name="ingredientsJson" value={JSON.stringify(ingredients.filter((ingredient) => !ingredient.isPendingDeletion).map(({ id, originalText, notes }) => ({ id, originalText, notes })))} />
                {ingredients.map((ingredient, index) => (
                  <div key={ingredient.id} className={`flex items-center gap-2 ${ingredient.isPendingDeletion ? "opacity-50" : ""}`}>
                      <Input
                        value={ingredient.originalText}
                        disabled={ingredient.isPendingDeletion}
                        onChange={(event) => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, originalText: event.target.value } : item))}
                        aria-label={`Ingredient ${index + 1}`}
                        className={ingredient.isPendingDeletion ? "line-through" : undefined}
                      />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 shrink-0"
                      onClick={() => setIngredients((current) => current.map((item) => item.id === ingredient.id ? { ...item, isPendingDeletion: !item.isPendingDeletion } : item))}
                      aria-label={`${ingredient.isPendingDeletion ? "Restore" : "Remove"} ingredient ${index + 1}`}
                    >
                      {ingredient.isPendingDeletion ? <RotateCcw className="size-5" /> : <Trash2 className="size-5" />}
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                  <Plus className="size-4" />
                  Add ingredient
                </Button>
              </section>
            ) : ingredients.length > 0 ? <RecipeIngredientList ingredients={ingredients} /> : emptyIngredients}
          </CardContent>
        </Card>
      </div>

      {(isEditing || recipe.steps.length > 0 || showEmptySteps) ? <Card className="bg-white/85">
        <CardHeader><CardTitle>Recipe</CardTitle></CardHeader>
        <CardContent>
          {isEditing ? (
              <section className="space-y-4">
                <input form={formId} type="hidden" name="stepsJson" value={JSON.stringify(steps.filter((step) => !step.isPendingDeletion).map(({ id, section, text }) => ({ id, section, text })))} />
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedStepId) moveStep(draggedStepId, step.id);
                      setDraggedStepId(null);
                    }}
                    className={`flex gap-2 rounded-[24px] bg-secondary/40 p-4 ${step.isPendingDeletion ? "opacity-50" : ""}`}
                  >
                    <button
                      type="button"
                      draggable={!step.isPendingDeletion}
                      disabled={step.isPendingDeletion}
                      onDragStart={() => setDraggedStepId(step.id)}
                      onDragEnd={() => setDraggedStepId(null)}
                      aria-label={`Reorder step ${index + 1}`}
                      className="mt-2 h-fit cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="size-5" />
                    </button>
                    <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Step {index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, isPendingDeletion: !item.isPendingDeletion } : item))}
                        aria-label={`${step.isPendingDeletion ? "Restore" : "Remove"} step ${index + 1}`}
                      >
                        {step.isPendingDeletion ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
                      </Button>
                    </div>
                    <Textarea
                      value={step.text}
                      disabled={step.isPendingDeletion}
                      onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, text: event.target.value } : item))}
                      aria-label={`Step ${index + 1}`}
                      className="min-h-32 bg-white"
                    />
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addStep}>
                  <Plus className="size-4" />
                  Add step
                </Button>
              </section>
            ) : steps.length > 0 ? (
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
            ) : emptySteps}
        </CardContent>
      </Card> : null}
    </div>
  );
}

type RecipeIngredientDraft = PublicRecipeDetailView["ingredients"][number] & {
  isPendingDeletion?: boolean;
};

type RecipeStepDraft = PublicRecipeDetailView["steps"][number] & {
  isPendingDeletion?: boolean;
};

function createDraftId() {
  return `new-${crypto.randomUUID()}`;
}

function UnavailableContent() {
  return <p className="text-sm text-muted-foreground">Recipe content is not available yet.</p>;
}
