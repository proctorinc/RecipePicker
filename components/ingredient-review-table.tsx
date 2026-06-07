"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { reviewIngredientAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import type {
  CanonicalIngredientOption,
  IngredientReviewItemView,
  IngredientReviewSuggestionView,
} from "@/types/view-models";

const initialState: ActionState = {
  status: "idle",
  message: "",
};

type ReviewMode = "match_existing" | "create_new";

export function IngredientReviewTable({
  items,
  canonicalOptions,
}: {
  items: IngredientReviewItemView[];
  canonicalOptions: CanonicalIngredientOption[];
}) {
  const router = useRouter();
  const [hiddenIngredientIds, setHiddenIngredientIds] = useState<string[]>([]);
  const [activeIngredientId, setActiveIngredientId] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  const visibleItems = items.filter((item) => !hiddenIngredientIds.includes(item.ingredientId));
  const activeItem = visibleItems.find((item) => item.ingredientId === activeIngredientId) ?? null;

  useEffect(() => {
    setHiddenIngredientIds((current) => current.filter((ingredientId) => items.some((item) => item.ingredientId === ingredientId)));
  }, [items]);

  useEffect(() => {
    if (activeIngredientId && !visibleItems.some((item) => item.ingredientId === activeIngredientId)) {
      setActiveIngredientId(null);
    }
  }, [activeIngredientId, visibleItems]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No ingredient matches are waiting for review.</p>;
  }

  if (visibleItems.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading the next pending ingredients...</p>;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-[24px] border border-border/60 bg-secondary/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>{visibleItems.length} ingredients currently need review on this page</p>
            {isRefreshing ? <p>Loading the next pending ingredients...</p> : null}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient</TableHead>
              <TableHead>Current guess</TableHead>
              <TableHead>Recipe</TableHead>
              <TableHead>Signals</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.map((item) => (
              <TableRow key={item.ingredientId}>
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium">{item.originalText}</p>
                    <p className="text-xs text-muted-foreground">
                      Parsed as: {item.parsedIngredientText ?? item.normalizedIngredientPhrase ?? "unknown"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{describeCurrentSuggestion(item)}</p>
                    {item.suggestedParentCanonicalName ? (
                      <p className="text-xs text-muted-foreground">Family: {item.suggestedParentCanonicalName}</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium">{item.recipeTitle}</p>
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline underline-offset-4"
                      >
                        Open source recipe
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">No source URL</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {item.matchConfidence ? <Badge variant="outline">{item.matchConfidence}% confidence</Badge> : null}
                    {item.matchedBy ? <Badge variant="secondary">{formatMatchSource(item.matchedBy)}</Badge> : null}
                    {item.occurrenceCount > 1 ? <Badge variant="warning">{item.occurrenceCount} uses</Badge> : null}
                    {item.aiSuggestions.length > 0 ? <Badge variant="outline">{item.aiSuggestions.length} AI suggestions</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="secondary" onClick={() => setActiveIngredientId(item.ingredientId)}>
                    Resolve
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(activeItem)} onOpenChange={(open) => setActiveIngredientId(open ? activeIngredientId : null)}>
        {activeItem ? (
          <DialogContent className="w-[min(92vw,52rem)] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Resolve ingredient</DialogTitle>
              <DialogDescription>
                Review the important context for `{activeItem.originalText}` and save the right ingredient mapping.
              </DialogDescription>
            </DialogHeader>
            <IngredientReviewForm
              item={activeItem}
              canonicalOptions={canonicalOptions}
              onResolved={() => {
                setHiddenIngredientIds((current) =>
                  current.includes(activeItem.ingredientId) ? current : current.concat(activeItem.ingredientId),
                );
                setActiveIngredientId(null);
                startTransition(() => {
                  router.refresh();
                });
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function IngredientReviewForm({
  item,
  canonicalOptions,
  onResolved,
}: {
  item: IngredientReviewItemView;
  canonicalOptions: CanonicalIngredientOption[];
  onResolved: () => void;
}) {
  const [reviewMode, setReviewMode] = useState<ReviewMode>(
    item.suggestedAction === "create_new" ? "create_new" : "match_existing",
  );
  const [canonicalSearch, setCanonicalSearch] = useState("");
  const [canonicalIngredientId, setCanonicalIngredientId] = useState(item.suggestedCanonicalIngredientId ?? "");
  const [newCanonicalName, setNewCanonicalName] = useState(
    item.suggestedAction === "create_new" ? item.suggestedCanonicalName ?? item.normalizedIngredientPhrase ?? "" : "",
  );
  const [parentCanonicalIngredientId, setParentCanonicalIngredientId] = useState(item.suggestedParentCanonicalIngredientId ?? "");
  const [ingredientKind, setIngredientKind] = useState<"family" | "base" | "leaf">(item.suggestedIngredientKind ?? "leaf");
  const [aliasText, setAliasText] = useState(item.originalText);
  const [attributes, setAttributes] = useState(item.suggestedAttributes.join(", "));
  const [didResolve, setDidResolve] = useState(false);
  const [state, formAction] = useActionState(reviewIngredientAction, initialState);

  useEffect(() => {
    setReviewMode(item.suggestedAction === "create_new" ? "create_new" : "match_existing");
    setCanonicalSearch("");
    setCanonicalIngredientId(item.suggestedCanonicalIngredientId ?? "");
    setNewCanonicalName(item.suggestedAction === "create_new" ? item.suggestedCanonicalName ?? item.normalizedIngredientPhrase ?? "" : "");
    setParentCanonicalIngredientId(item.suggestedParentCanonicalIngredientId ?? "");
    setIngredientKind(item.suggestedIngredientKind ?? "leaf");
    setAliasText(item.originalText);
    setAttributes(item.suggestedAttributes.join(", "));
    setDidResolve(false);
  }, [item]);

  const filteredCanonicalOptions = useMemo(() => {
    const query = canonicalSearch.trim().toLowerCase();

    if (!query) {
      return canonicalOptions;
    }

    return canonicalOptions.filter((option) => {
      const haystack = [option.displayName, option.parentDisplayName, option.ingredientKind].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [canonicalOptions, canonicalSearch]);

  const familyOptions = useMemo(
    () => canonicalOptions.filter((option) => option.ingredientKind === "family"),
    [canonicalOptions],
  );

  useEffect(() => {
    if (state.status === "success" && !didResolve) {
      setDidResolve(true);
      toast.success(state.message);
      onResolved();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [didResolve, onResolved, state]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="ingredientId" value={item.ingredientId} />
      <input type="hidden" name="recipeId" value={item.recipeId} />
      <input type="hidden" name="normalizedIngredientPhrase" value={item.normalizedIngredientPhrase ?? ""} />
      <input type="hidden" name="aiSuggestionsJson" value={JSON.stringify(item.aiSuggestions)} />
      <input type="hidden" name="reviewMode" value={reviewMode} />
      <input type="hidden" name="fallbackSuggestedCanonicalIngredientId" value={item.suggestedCanonicalIngredientId ?? ""} />
      <input type="hidden" name="fallbackSuggestedCanonicalName" value={item.suggestedCanonicalName ?? ""} />
      <input
        type="hidden"
        name="fallbackSuggestedParentCanonicalIngredientId"
        value={item.suggestedParentCanonicalIngredientId ?? ""}
      />
      <input type="hidden" name="fallbackSuggestedIngredientKind" value={item.suggestedIngredientKind ?? ""} />
      <input type="hidden" name="fallbackSuggestedAttributes" value={item.suggestedAttributes.join(",")} />

      <div className="space-y-3 rounded-[28px] border border-border/70 bg-secondary/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.recipeTitle}</p>
            <p className="font-medium">{item.originalText}</p>
            <p className="text-sm text-muted-foreground">
              Parsed as: {item.parsedIngredientText ?? item.normalizedIngredientPhrase ?? "unknown"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {item.matchConfidence ? <Badge variant="outline">{item.matchConfidence}% confidence</Badge> : null}
            {item.matchedBy ? <Badge variant="secondary">{formatMatchSource(item.matchedBy)}</Badge> : null}
            {item.occurrenceCount > 1 ? <Badge variant="warning">Shows up {item.occurrenceCount} times</Badge> : null}
          </div>
        </div>

        <div className="rounded-[22px] bg-background/80 p-4">
          <p className="text-sm font-medium">What the app thinks right now</p>
          <p className="mt-2 text-sm text-muted-foreground">{describeCurrentSuggestion(item)}</p>
          {item.suggestedParentCanonicalName ? (
            <p className="mt-2 text-xs text-muted-foreground">Family context: {item.suggestedParentCanonicalName}</p>
          ) : null}
          {item.suggestedAction !== "keep_unresolved" ? (
            <div className="mt-3">
              <Button type="submit" name="acceptCurrentSuggestion" value="1" variant="outline" size="sm">
                Accept current suggestion
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {item.aiSuggestions.length > 0 ? (
        <div className="space-y-3 rounded-[22px] border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-700" />
            <p className="text-sm font-medium text-amber-950">AI suggestions</p>
          </div>
          <p className="text-sm text-amber-900">
            Accept one of these if it looks right, or use the guided editor below to adjust it.
          </p>
          <div className="space-y-3">
            {item.aiSuggestions.map((suggestion, index) => (
              <SuggestionCard key={`${item.ingredientId}-${index}`} suggestion={suggestion} index={index} />
            ))}
          </div>
        </div>
      ) : null}

      <Tabs value={reviewMode} onValueChange={(value) => setReviewMode(value as ReviewMode)} className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Choose how to resolve this ingredient</p>
          <TabsList>
            <TabsTrigger value="match_existing">Match to existing ingredient</TabsTrigger>
            <TabsTrigger value="create_new">Create new ingredient</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="match_existing" className="space-y-4">
          <div className="rounded-[22px] bg-background/80 p-4 text-sm text-muted-foreground">
            Use this when the phrase is really another name for something you already track, like `scallions` to `green onion`.
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Search existing ingredients</span>
              <Input
                value={canonicalSearch}
                onChange={(event) => setCanonicalSearch(event.target.value)}
                placeholder="Filter the ingredient list"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Choose the best existing ingredient</span>
              <select
                name="canonicalIngredientId"
                value={canonicalIngredientId}
                onChange={(event) => setCanonicalIngredientId(event.target.value)}
                className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Choose one</option>
                {filteredCanonicalOptions.map((option) => (
                  <option key={option.canonicalIngredientId} value={option.canonicalIngredientId}>
                    {formatCanonicalOption(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            If this ingredient is only a close variant, keep the match here and use attributes instead of creating something new.
          </p>
        </TabsContent>

        <TabsContent value="create_new" className="space-y-4">
          <div className="rounded-[22px] bg-background/80 p-4 text-sm text-muted-foreground">
            Use this when the ingredient is materially distinct and should become its own tracked item, like `chicken breast`.
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium">New ingredient name</span>
              <Input
                name="newCanonicalName"
                value={newCanonicalName}
                onChange={(event) => setNewCanonicalName(event.target.value)}
                placeholder="Example: chicken breast"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Ingredient type</span>
              <select
                name="ingredientKind"
                value={ingredientKind}
                onChange={(event) => setIngredientKind(event.target.value as "family" | "base" | "leaf")}
                className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="leaf">Specific ingredient</option>
                <option value="family">Broader family</option>
                <option value="base">Base with attribute variants</option>
              </select>
            </label>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium">Optional parent family</span>
            <select
              name="parentCanonicalIngredientId"
              value={parentCanonicalIngredientId}
              onChange={(event) => setParentCanonicalIngredientId(event.target.value)}
              className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No parent family</option>
              {familyOptions.map((option) => (
                <option key={option.canonicalIngredientId} value={option.canonicalIngredientId}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            Example: create `chicken breast` with parent `chicken`. For a broad family itself, leave the parent empty and set the type to `Broader family`.
          </p>
        </TabsContent>
      </Tabs>

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Attributes to keep with this ingredient</span>
          <Input
            name="attributes"
            value={attributes}
            onChange={(event) => setAttributes(event.target.value)}
            placeholder="light, unsalted, fresh"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Alias text to remember for future imports</span>
          <Input
            name="aliasText"
            value={aliasText}
            onChange={(event) => setAliasText(event.target.value)}
            placeholder="Usually keep the original wording here"
          />
        </label>
      </div>

      <div className="rounded-[22px] bg-background/80 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Save behavior</p>
        <label className="mt-3 flex items-start gap-3">
          <input type="checkbox" name="savePhraseMapping" defaultChecked className="mt-1 h-4 w-4 rounded border border-border" />
          <span>
            Save this phrase as a reusable mapping.
            <span className="block text-xs text-muted-foreground">
              This will help future imports of `{item.normalizedIngredientPhrase ?? item.originalText}`.
            </span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-3">
          <input type="checkbox" name="saveAlias" defaultChecked className="mt-1 h-4 w-4 rounded border border-border" />
          <span>
            Save the alias text too.
            <span className="block text-xs text-muted-foreground">
              Use this when the original wording is a useful synonym you want the app to remember.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary">
          Confirm resolution
        </Button>
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline underline-offset-4">
            Open source recipe
          </a>
        ) : null}
      </div>
    </form>
  );
}

function SuggestionCard({
  suggestion,
  index,
}: {
  suggestion: IngredientReviewSuggestionView;
  index: number;
}) {
  return (
    <div className="rounded-[20px] bg-white/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{formatSuggestionAction(suggestion.action)}</Badge>
            <Badge variant="outline">{suggestion.confidence}% confidence</Badge>
          </div>
          <p className="text-sm text-foreground">{formatSuggestionLabel(suggestion)}</p>
          <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
        </div>
        <Button type="submit" name="acceptSuggestionIndex" value={String(index)} variant="outline" size="sm">
          <Wand2 className="h-4 w-4" />
          Accept this suggestion
        </Button>
      </div>
    </div>
  );
}

function formatCanonicalOption(option: CanonicalIngredientOption) {
  const suffix = option.parentDisplayName ? ` -> ${option.parentDisplayName}` : "";
  return `${option.displayName} (${formatIngredientKind(option.ingredientKind)})${suffix}`;
}

function formatIngredientKind(value: "family" | "base" | "leaf" | null) {
  switch (value) {
    case "family":
      return "family";
    case "base":
      return "base";
    case "leaf":
      return "specific";
    default:
      return "ingredient";
  }
}

function describeCurrentSuggestion(item: IngredientReviewItemView) {
  if (item.suggestedAction === "create_new" && item.suggestedCanonicalName) {
    return `Create a new ingredient named ${item.suggestedCanonicalName}${item.suggestedParentCanonicalName ? ` under ${item.suggestedParentCanonicalName}` : ""}.`;
  }

  if (item.suggestedCanonicalName) {
    return `Match this to ${item.suggestedCanonicalName}${item.suggestedAttributes.length > 0 ? ` with attributes ${item.suggestedAttributes.join(", ")}` : ""}.`;
  }

  return "No trustworthy existing match was found yet. You can match it manually or create a new ingredient.";
}

function formatSuggestionAction(action: IngredientReviewSuggestionView["action"]) {
  switch (action) {
    case "match_existing":
      return "Match existing";
    case "create_new":
      return "Create new";
    case "keep_unresolved":
      return "Needs review";
  }
}

function formatSuggestionLabel(suggestion: IngredientReviewSuggestionView) {
  if (suggestion.action === "match_existing") {
    return `Use existing ingredient: ${suggestion.canonicalName ?? "unknown"}`;
  }

  if (suggestion.action === "create_new") {
    return `Create ${suggestion.newCanonicalName ?? "new ingredient"}${suggestion.parentCanonicalName ? ` under ${suggestion.parentCanonicalName}` : ""}`;
  }

  return "Keep unresolved for manual review";
}

function formatMatchSource(value: string) {
  return value.replaceAll("_", " ");
}
