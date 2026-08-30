"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { filterIngredientUnitOptions } from "@/lib/ingredient-units";
import {
  parseIngredientReviewPageWithAiAction,
  reviewIngredientAction,
} from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import type { CanonicalIngredientOption, IngredientReviewItemView } from "@/types/view-models";

const initialState: ActionState = { status: "idle", message: "" };

export function IngredientReviewTable({
  items,
  page,
  recipeId,
  aiEnabled,
}: {
  items: IngredientReviewItemView[];
  page: number;
  recipeId: string | null;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [isRefreshing, startTransition] = useTransition();
  const [parseState, parseAction] = useActionState(parseIngredientReviewPageWithAiAction, initialState);
  const item = items[index] ?? null;

  useEffect(() => { setIndex((value) => Math.min(value, Math.max(items.length - 1, 0))); }, [items]);
  useEffect(() => {
    if (parseState.status === "success") {
      toast.success(parseState.message);
      startTransition(() => router.refresh());
    } else if (parseState.status === "error") {
      toast.error(parseState.message);
    }
  }, [parseState, router, startTransition]);
  if (!item) return <p className="text-sm text-muted-foreground">No ingredients are waiting for review.</p>;

  return (
    <>
      <div className="rounded-[24px] border border-border/60 bg-secondary/20 p-5">
        <p className="font-medium">{items.length} ingredient{items.length === 1 ? "" : "s"} waiting on this page</p>
        <p className="mt-1 text-sm text-muted-foreground">Review one at a time. Accept a good parse, adjust it, or mark it as not an ingredient.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={parseAction}>
            <input type="hidden" name="page" value={page} />
            {recipeId ? <input type="hidden" name="recipeId" value={recipeId} /> : null}
            <ParsePageButton aiEnabled={aiEnabled} refreshing={isRefreshing} />
          </form>
          <Button variant="outline" onClick={() => setOpen(true)}>Review next ingredient</Button>
        </div>
        {!aiEnabled ? <p className="mt-3 text-sm text-muted-foreground">AI parsing needs an active shared connection. <Link className="underline underline-offset-4" href="/settings/ai">Set up AI</Link></p> : null}
        {isRefreshing ? <p className="mt-3 text-sm text-muted-foreground">Loading more ingredients…</p> : null}
      </div>
      <IngredientReviewDialog
        item={item}
        open={open}
        onOpenChange={setOpen}
        title={`Review ingredient ${index + 1} of ${items.length}`}
        onDone={() => {
          if (index + 1 < items.length) setIndex(index + 1);
          else { setOpen(false); startTransition(() => router.refresh()); }
        }}
      />
    </>
  );
}

export function IngredientReviewDialog({
  item,
  open,
  onOpenChange,
  title = "Review ingredient",
  onDone,
}: {
  item: IngredientReviewItemView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onDone: () => void;
}) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,44rem)] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{item.recipeTitle}</DialogDescription>
        </DialogHeader>
        <IngredientReviewForm item={item} onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}

function IngredientReviewForm({ item, onDone }: {
  item: IngredientReviewItemView;
  onDone: () => void;
}) {
  const [measurements, setMeasurements] = useState(item.measurements.map((measurement) => ({ ...measurement })));
  const [ingredientText, setIngredientText] = useState(item.parsedIngredientText ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [canonicalSearch, setCanonicalSearch] = useState("");
  const [canonicalIngredientId, setCanonicalIngredientId] = useState("");
  const [matchingOptions, setMatchingOptions] = useState<CanonicalIngredientOption[]>([]);
  const [state, formAction] = useActionState(reviewIngredientAction, initialState);

  useEffect(() => {
    setMeasurements(item.measurements.map((measurement) => ({ ...measurement }))); setIngredientText(item.parsedIngredientText ?? "");
    setNotes(item.notes ?? ""); setCanonicalSearch(""); setCanonicalIngredientId(""); setMatchingOptions([]);
  }, [item]);
  useEffect(() => { if (state.status === "success") { toast.success(state.message); onDone(); } else if (state.status === "error") toast.error(state.message); }, [state, onDone]);
  useEffect(() => {
    const query = canonicalSearch.trim();
    if (!query) { setMatchingOptions([]); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/ingredients/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unable to search ingredients.");
        const data = await response.json() as { items: CanonicalIngredientOption[] };
        setMatchingOptions(data.items);
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") setMatchingOptions([]);
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [canonicalSearch]);

  return <form action={formAction} className="space-y-5">
    <input type="hidden" name="ingredientId" value={item.ingredientId} />
    <input type="hidden" name="recipeId" value={item.recipeId} />
    <input type="hidden" name="canonicalIngredientId" value={canonicalIngredientId} />
    <input type="hidden" name="measurementsJson" value={JSON.stringify(measurements.map(({ amountText, unit }) => ({ amountText, unit })))} />
    <div className="rounded-2xl border border-border bg-secondary/20 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Original recipe text</p>
      <p className="mt-2 font-medium">{item.originalText}</p>
      {item.sourceUrl ? <a className="mt-2 inline-block text-sm underline underline-offset-4" target="_blank" rel="noreferrer" href={item.sourceUrl}>Open recipe source</a> : null}
    </div>
    {item.aiParseOutcome === "not_ingredient" || item.aiParseOutcome === "unresolved" ? <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><p className="font-medium">AI feedback: {item.aiParseOutcome === "not_ingredient" ? "This may not be an ingredient" : "This does not fit the ingredient fields cleanly"}</p><p className="mt-1 text-muted-foreground">{item.aiParseReason ?? "The AI did not provide a reason."}</p><p className="mt-2 text-muted-foreground">You can correct and accept it, or mark it as not an ingredient.</p></div> : null}
    <div className="space-y-3">
      <div><p className="font-medium">What we extracted</p><p className="text-sm text-muted-foreground">Correct any field that looks wrong, then accept it.</p></div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Measurements</p>
        {measurements.map((measurement, index) => <div key={measurement.id} className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input value={measurement.amountText} onChange={(event) => setMeasurements((current) => current.map((entry) => entry.id === measurement.id ? { ...entry, amountText: event.target.value } : entry))} placeholder="e.g. 2" /><MeasurementSearch value={measurement.unit} onChange={(unit) => setMeasurements((current) => current.map((entry) => entry.id === measurement.id ? { ...entry, unit } : entry))} /><Button type="button" variant="ghost" size="sm" onClick={() => setMeasurements((current) => current.filter((entry) => entry.id !== measurement.id))}>Remove</Button></div>)}
        <Button type="button" variant="outline" size="sm" onClick={() => setMeasurements((current) => [...current, { id: crypto.randomUUID(), amountText: "", amountValue: null, amountMaxValue: null, unit: "" }])}>Add measurement</Button>
      </div>
      <Field label="What is the ingredient?" name="ingredientText" value={ingredientText} onChange={setIngredientText} placeholder="e.g. yellow onion" required />
      <Field label="Notes (optional)" name="notes" value={notes} onChange={setNotes} placeholder="e.g. finely chopped" />
    </div>
    <details className="rounded-2xl border border-border p-4">
      <summary className="cursor-pointer font-medium">Optional: use an existing ingredient or see related matches</summary>
      <p className="mt-2 text-sm text-muted-foreground">Leave this alone to create a provisional ingredient you can organize later.</p>
      <Input className="mt-3" value={canonicalSearch} onChange={(event) => setCanonicalSearch(event.target.value)} placeholder="Search existing ingredients" />
      {matchingOptions.length ? <div className="mt-2 space-y-1">{matchingOptions.map((option) => <button key={option.canonicalIngredientId} type="button" onClick={() => { setCanonicalIngredientId(option.canonicalIngredientId); setIngredientText(option.displayName); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary ${canonicalIngredientId === option.canonicalIngredientId ? "bg-secondary" : ""}`}>{option.displayName}{option.parentDisplayName ? ` · ${option.parentDisplayName}` : ""}</button>)}</div> : null}
      {canonicalIngredientId ? <p className="mt-2 text-sm text-muted-foreground">This will be saved as a synonym of the selected existing ingredient.</p> : null}
    </details>
    <div className="flex flex-wrap gap-3">
      <Button type="submit" name="action" value="accept">Accept{item.parsedIngredientText !== ingredientText || JSON.stringify(item.measurements.map(({ amountText, unit }) => ({ amountText, unit }))) !== JSON.stringify(measurements.map(({ amountText, unit }) => ({ amountText, unit })) || (item.notes ?? "") !== notes) ? " with changes" : ""}</Button>
      <Button type="submit" name="action" value="reject" variant="outline">Not an ingredient</Button>
    </div>
  </form>;
}

function Field({ label, name, value, onChange, placeholder, required = false }: { label: string; name: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean }) {
  return <label className="space-y-2"><span className="text-sm font-medium">{label}</span><Input name={name} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>;
}

function MeasurementSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const matches = filterIngredientUnitOptions(value);
  const hasExactMatch = matches.some((option) => option.value === value.trim().toLowerCase() || option.aliases.includes(value.trim().toLowerCase()));

  return <label className="relative space-y-2">
    <span className="text-sm font-medium">Measurement</span>
    <Input
      name="unit"
      value={value}
      onChange={(event) => { onChange(event.target.value); setIsOpen(true); }}
      onFocus={() => setIsOpen(true)}
      onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
      placeholder="Search measurements, e.g. cup"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={isOpen}
    />
    {isOpen ? <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md">
      {matches.map((option) => <button key={option.value} type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.value); setIsOpen(false); }}>
        {option.label}<span className="ml-2 text-muted-foreground">{option.aliases.join(", ")}</span>
      </button>)}
      {!matches.length && value.trim() ? <p className="px-3 py-2 text-sm text-muted-foreground">No matching measurement. “{value.trim()}” will be saved as a new measurement.</p> : null}
    </div> : null}
    {!hasExactMatch && value.trim() ? <span className="text-xs text-muted-foreground">New measurement</span> : null}
  </label>;
}

function ParsePageButton({ aiEnabled, refreshing }: { aiEnabled: boolean; refreshing: boolean }) {
  const { pending } = useFormStatus();

  return <Button type="submit" disabled={!aiEnabled || pending || refreshing}>
    {pending ? "Parsing with AI..." : "Parse current page with AI"}
  </Button>;
}
