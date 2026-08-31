"use client";

import { useContext, useEffect, useState, type DragEvent, type ReactNode } from "react";
import { GripVertical, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RecipeIngredientList } from "@/components/recipe-ingredient-list";
import { RecipeEditingContext } from "@/components/recipe-metadata-editor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatIso8601Duration } from "@/lib/utils";
import { formatIngredientMeasurements, formatIngredientOriginalText, type IngredientMeasurement, type ParsedIngredientLine } from "@/lib/ingredient-parsing";
import { formatScaledIngredientParts } from "@/lib/ingredient-scaling";
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
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);

  useEffect(() => {
    setIngredients(recipe.ingredients);
    setSteps(recipe.steps);
    setEditingIngredientId(null);
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
    const ingredient = createIngredientDraft();
    setIngredients((current) => [...current, ingredient]);
    setEditingIngredientId(ingredient.id);
  }

  function updateIngredient(id: string, patch: Partial<RecipeIngredientDraft>) {
    setIngredients((current) => current.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      const measurementText = formatIngredientMeasurements(next.measurements ?? []);
      return { ...next, originalText: [measurementText, next.parsedText?.trim()].filter(Boolean).join(" ") + (next.notes?.trim() ? `, ${next.notes.trim()}` : "") };
    }));
  }

  function deleteIngredient(id: string) {
    setIngredients((current) => current.map((item) => item.id === id ? { ...item, isPendingDeletion: !item.isPendingDeletion } : item));
  }

  const editingIngredient = ingredients.find((ingredient) => ingredient.id === editingIngredientId) ?? null;

  function closeIngredientEditor(open: boolean) {
    if (open) return;
    if (editingIngredient?.id.startsWith("new-") && !editingIngredient.parsedText?.trim()) {
      setIngredients((current) => current.filter((ingredient) => ingredient.id !== editingIngredient.id));
    }
    setEditingIngredientId(null);
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
          <CardContent>
            {isEditing ? (
              <section className="space-y-3">
                <input form={formId} type="hidden" name="ingredientsJson" value={JSON.stringify(ingredients.filter((ingredient) => !ingredient.isPendingDeletion && ingredient.parsedText?.trim()).map(({ id, originalText, parsedText, notes, measurements }) => ({ id, originalText, ingredientText: parsedText, notes, measurements })))} />
                {ingredients.map((ingredient, index) => (
                  <div key={ingredient.id} className={`space-y-2 ${ingredient.isPendingDeletion ? "opacity-50" : ""}`}>
                    {(() => {
                      const parts = formatScaledIngredientParts(ingredient, 1);
                      return <div className="flex items-start gap-3">
                        {parts.amount ? <span className="mt-0.5 shrink-0 rounded-lg bg-secondary px-2 py-1 text-sm font-semibold text-foreground">{parts.amount}</span> : null}
                        <p className="min-w-0 pt-1 font-medium text-foreground">{parts.description || "New ingredient"}</p>
                      </div>;
                    })()}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={ingredient.isPendingDeletion}
                        onClick={() => setEditingIngredientId(ingredient.id)}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant={ingredient.isPendingDeletion ? "ghost" : "destructive"}
                        size="sm"
                        onClick={() => deleteIngredient(ingredient.id)}
                      >
                        {ingredient.isPendingDeletion ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
                        {ingredient.isPendingDeletion ? "Restore" : "Delete"}
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                  <Icon icon={Plus} size="sm" />
                  Add ingredient
                </Button>
              </section>
            ) : ingredients.length > 0 ? (
              <RecipeIngredientList
                ingredients={ingredients}
                recipeId={recipe.recipeId}
                recipeTitle={recipe.title}
                sourceUrl={recipe.sourceUrl}
              />
            ) : emptyIngredients}
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
                      className="mt-1 flex size-12 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-muted-foreground hover:bg-secondary active:cursor-grabbing"
                    >
                      <GripVertical className="size-7" />
                    </button>
                    <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Step {index + 1}</span>
                      <Button
                        type="button"
                        variant={step.isPendingDeletion ? "ghost" : "destructive"}
                        size="sm"
                        onClick={() => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, isPendingDeletion: !item.isPendingDeletion } : item))}
                      >
                        {step.isPendingDeletion ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
                        {step.isPendingDeletion ? "Restore" : "Delete"}
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
                <li key={step.id} className="flow-root rounded-[24px] bg-secondary/40 p-4">
                  <div className="float-left mr-4 flex h-9 w-9 translate-y-2.5 items-center justify-center rounded-full bg-white text-sm font-semibold shadow-sm">{index + 1}</div>
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
      <IngredientEditorDialog
        ingredient={editingIngredient}
        open={Boolean(editingIngredient)}
        onOpenChange={closeIngredientEditor}
        onSave={(patch) => {
          if (editingIngredient) updateIngredient(editingIngredient.id, patch);
          setEditingIngredientId(null);
        }}
      />
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

function createIngredientDraft(parsed?: ParsedIngredientLine, id = createDraftId()): RecipeIngredientDraft {
  const measurements = (parsed?.measurements ?? []).map((measurement, index) => ({ id: `new-measurement-${index}`, ...measurement }));
  const amount = parsed?.amountText ?? null;
  const unit = parsed?.unit ?? null;
  const parsedText = parsed?.ingredientText ?? null;
  const notes = parsed?.notes ?? null;
  return {
    id, originalText: formatIngredientOriginalText({ amountText: amount, unit, ingredientText: parsedText, notes }), displayText: "",
    measurements, amount, amountValue: parsed?.amountValue ?? null, amountMaxValue: parsed?.amountMaxValue ?? null, unit, parsedText, notes,
    canonicalIngredientId: null, canonicalName: null, attributes: [], normalizationStatus: "needs_review",
  };
}

function IngredientEditorDialog({ ingredient, open, onOpenChange, onSave }: {
  ingredient: RecipeIngredientDraft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Pick<RecipeIngredientDraft, "measurements" | "parsedText" | "notes">) => void;
}) {
  const [measurements, setMeasurements] = useState<Array<IngredientMeasurement & { id: string }>>([]);
  const [parsedText, setParsedText] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setMeasurements((ingredient?.measurements ?? []).map((measurement, index) => ({ ...measurement, id: measurement.id || `measurement-${index}` })));
    setParsedText(ingredient?.parsedText ?? "");
    setNotes(ingredient?.notes ?? "");
  }, [ingredient]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88vh] w-[min(94vw,44rem)] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit ingredient</DialogTitle>
        <DialogDescription>Update the amount, ingredient description, and any notes.</DialogDescription>
      </DialogHeader>
      <form className="space-y-5" onSubmit={(event) => {
        event.preventDefault();
        onSave({ measurements: measurements.filter((measurement) => measurement.amountText.trim() && measurement.unit.trim()), parsedText: parsedText || null, notes: notes || null });
      }}>
        {ingredient?.originalText ? <div className="rounded-2xl border border-border bg-secondary/20 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Original recipe text</p><p className="mt-2 font-medium">{ingredient.originalText}</p></div> : null}
        <div className="space-y-3">
          <div><p className="font-medium">Ingredient details</p><p className="text-sm text-muted-foreground">Correct any field that looks wrong.</p></div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Measurements</p>
            {measurements.map((measurement, index) => <div key={measurement.id} className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input value={measurement.amountText} onChange={(event) => setMeasurements((current) => current.map((item) => item.id === measurement.id ? { ...item, amountText: event.target.value } : item))} placeholder="e.g. 1" /><Input value={measurement.unit} onChange={(event) => setMeasurements((current) => current.map((item) => item.id === measurement.id ? { ...item, unit: event.target.value } : item))} placeholder="e.g. cup" /><Button type="button" variant="ghost" size="sm" aria-label={`Remove measurement ${index + 1}`} onClick={() => setMeasurements((current) => current.filter((item) => item.id !== measurement.id))}>Remove</Button></div>)}
            <Button type="button" variant="outline" size="sm" onClick={() => setMeasurements((current) => [...current, { id: crypto.randomUUID(), amountText: "", amountValue: null, amountMaxValue: null, unit: "" }])}>Add measurement</Button>
          </div>
          <IngredientField label="What is the ingredient?" value={parsedText} onChange={setParsedText} placeholder="e.g. yellow onion" required />
          <IngredientField label="Notes (optional)" value={notes} onChange={setNotes} placeholder="e.g. finely chopped" />
        </div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={!parsedText.trim()}>Save ingredient</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function IngredientField({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) {
  return <label className="space-y-2"><span className="text-sm font-medium">{label}</span><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>;
}

function UnavailableContent() {
  return <p className="text-sm text-muted-foreground">Recipe content is not available yet.</p>;
}
