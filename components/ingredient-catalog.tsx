"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mergeCanonicalIngredientsAction, removeUnusedProvisionalIngredientsAction, reparentCanonicalIngredientAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import type { CanonicalIngredientOption, IngredientCatalogItemView, IngredientCatalogPageView } from "@/types/view-models";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const idle: ActionState = { status: "idle", message: "" };
export function IngredientCatalog({ catalog, recipeId }: { catalog: IngredientCatalogPageView; recipeId?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(catalog.query);
  const [cleanupState, cleanup] = useActionState(removeUnusedProvisionalIngredientsAction, idle);
  useEffect(() => { if (cleanupState.status === "success") { toast.success(cleanupState.message); router.refresh(); } if (cleanupState.status === "error") toast.error(cleanupState.message); }, [cleanupState, router]);
  const navigate = (page: number) => {
    const params = new URLSearchParams();
    if (recipeId) params.set("recipeId", recipeId);
    if (query.trim()) params.set("catalogQuery", query.trim());
    if (page > 1) params.set("catalogPage", String(page));
    router.push(`/settings/ingredients${params.size ? `?${params.toString()}` : ""}`);
  };
  return <div className="space-y-4"><div className="rounded-xl border border-border bg-secondary/20 p-3 text-sm text-muted-foreground"><p>After improving ingredient parsing, <a className="font-medium text-foreground underline" href="/settings/recipes">re-parse your recipes</a>, then remove provisional entries that no longer have uses.</p><form action={cleanup} onSubmit={(event) => { if (!window.confirm("Remove unused provisional ingredients? Confirmed ingredients and anything still used will be kept.")) event.preventDefault(); }} className="mt-2"><Button type="submit" size="sm" variant="outline">Remove unused provisional ingredients</Button></form></div><form onSubmit={(event) => { event.preventDefault(); navigate(1); }} className="flex gap-2"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search catalog, aliases, or family" /><Button type="submit" variant="outline">Search</Button></form>
    {catalog.totalCount ? <p className="text-sm text-muted-foreground">Showing {(catalog.page - 1) * catalog.pageSize + 1}-{(catalog.page - 1) * catalog.pageSize + catalog.items.length} of {catalog.totalCount} ingredients</p> : null}
    <div className="max-h-[30rem] overflow-y-auto rounded-2xl border border-border"><div className="divide-y divide-border">{catalog.items.map((item) => <CatalogRow key={item.canonicalIngredientId} item={item} />)}</div></div>
    {catalog.totalPages > 1 ? <div className="flex items-center justify-between gap-3"><Button type="button" variant="outline" disabled={catalog.page <= 1} onClick={() => navigate(catalog.page - 1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {catalog.page} of {catalog.totalPages}</span><Button type="button" variant="outline" disabled={catalog.page >= catalog.totalPages} onClick={() => navigate(catalog.page + 1)}>Next</Button></div> : null}
  </div>;
}
function CatalogRow({ item }: { item: IngredientCatalogItemView }) {
  const [mergeState, merge] = useActionState(mergeCanonicalIngredientsAction, idle); const [parentState, reparent] = useActionState(reparentCanonicalIngredientAction, idle);
  const [open, setOpen] = useState(false);
  const [familyQuery, setFamilyQuery] = useState(item.parentDisplayName ?? "");
  const [familyOptions, setFamilyOptions] = useState<CanonicalIngredientOption[]>([]);
  const [parentCanonicalIngredientId, setParentCanonicalIngredientId] = useState(item.parentCanonicalIngredientId ?? "");
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeOptions, setMergeOptions] = useState<CanonicalIngredientOption[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState("");
  useEffect(() => { if (mergeState.status === "success") { toast.success(mergeState.message); setOpen(false); } if (parentState.status === "success") { toast.success(parentState.message); } if (mergeState.status === "error") toast.error(mergeState.message); if (parentState.status === "error") toast.error(parentState.message); }, [mergeState, parentState]);
  useEffect(() => {
    const query = familyQuery.trim();
    if (!query) { setFamilyOptions([]); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/ingredients/search?q=${encodeURIComponent(query)}&kind=family`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as { items: CanonicalIngredientOption[] };
        setFamilyOptions(data.items.filter((entry) => entry.canonicalIngredientId !== item.canonicalIngredientId));
      } catch { if (!controller.signal.aborted) setFamilyOptions([]); }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [familyQuery, item.canonicalIngredientId]);
  useEffect(() => {
    const query = mergeQuery.trim();
    if (!query) { setMergeOptions([]); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/ingredients/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as { items: CanonicalIngredientOption[] };
        setMergeOptions(data.items.filter((entry) => entry.canonicalIngredientId !== item.canonicalIngredientId));
      } catch { if (!controller.signal.aborted) setMergeOptions([]); }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [item.canonicalIngredientId, mergeQuery]);
  return <div className="flex items-start justify-between gap-3 p-4"><div><p className="font-medium">{item.displayName} {item.catalogStatus === "provisional" ? <span className="text-xs text-amber-700">provisional</span> : null}</p><p className="text-xs text-muted-foreground">{item.parentDisplayName ? `Family: ${item.parentDisplayName}` : "No family"} · {item.usageCount} recipe uses{item.aliases.length ? ` · aliases: ${item.aliases.join(", ")}` : ""}</p></div><Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Edit</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[88vh] overflow-y-auto"><DialogHeader><DialogTitle>Edit {item.displayName}</DialogTitle><DialogDescription>Assign a family or merge this duplicate into another ingredient.</DialogDescription></DialogHeader><div className="mt-4 space-y-6">{item.ingredientKind !== "family" ? <form action={reparent} className="space-y-2"><input type="hidden" name="canonicalIngredientId" value={item.canonicalIngredientId} /><input type="hidden" name="parentCanonicalIngredientId" value={parentCanonicalIngredientId} /><label className="text-sm font-medium">Family</label><div className="flex gap-2"><Input value={familyQuery} onChange={(event) => { setFamilyQuery(event.target.value); setParentCanonicalIngredientId(""); }} placeholder="Search a family" /><Button size="sm" variant="outline">Save family</Button></div>{familyOptions.length ? <div className="rounded border">{familyOptions.map((family) => <button key={family.canonicalIngredientId} type="button" onClick={() => { setParentCanonicalIngredientId(family.canonicalIngredientId); setFamilyQuery(family.displayName); setFamilyOptions([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary">{family.displayName}</button>)}</div> : null}<button type="button" onClick={() => { setParentCanonicalIngredientId(""); setFamilyQuery(""); }} className="text-xs text-muted-foreground underline">Remove family</button></form> : null}<form action={merge} className="space-y-2 border-t border-border pt-5"><input type="hidden" name="sourceCanonicalIngredientId" value={item.canonicalIngredientId} /><input type="hidden" name="targetCanonicalIngredientId" value={mergeTargetId} /><label className="text-sm font-medium">Merge into</label><div className="flex gap-2"><Input value={mergeQuery} onChange={(event) => { setMergeQuery(event.target.value); setMergeTargetId(""); }} placeholder="Search an ingredient" /><Button size="sm" variant="outline" disabled={!mergeTargetId}>Merge</Button></div>{mergeOptions.length ? <div className="rounded border">{mergeOptions.map((entry) => <button key={entry.canonicalIngredientId} type="button" onClick={() => { setMergeTargetId(entry.canonicalIngredientId); setMergeQuery(entry.displayName); setMergeOptions([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary">{entry.displayName}{entry.parentDisplayName ? ` · ${entry.parentDisplayName}` : ""}</button>)}</div> : null}</form></div></DialogContent></Dialog>
  </div>;
}
