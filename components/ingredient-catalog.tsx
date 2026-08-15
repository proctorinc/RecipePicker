"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mergeCanonicalIngredientsAction, reparentCanonicalIngredientAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import type { IngredientCatalogItemView } from "@/types/view-models";

const idle: ActionState = { status: "idle", message: "" };
export function IngredientCatalog({ items }: { items: IngredientCatalogItemView[] }) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => `${item.displayName} ${item.parentDisplayName ?? ""} ${item.aliases.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-4"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search catalog, aliases, or family" />
    <div className="max-h-[30rem] overflow-y-auto rounded-2xl border border-border"><div className="divide-y divide-border">{filtered.map((item) => <CatalogRow key={item.canonicalIngredientId} item={item} all={items} />)}</div></div>
  </div>;
}
function CatalogRow({ item, all }: { item: IngredientCatalogItemView; all: IngredientCatalogItemView[] }) {
  const [mergeState, merge] = useActionState(mergeCanonicalIngredientsAction, idle); const [parentState, reparent] = useActionState(reparentCanonicalIngredientAction, idle);
  useEffect(() => { if (mergeState.status === "success") toast.success(mergeState.message); if (parentState.status === "success") toast.success(parentState.message); }, [mergeState, parentState]);
  const families = all.filter((entry) => entry.ingredientKind === "family" && entry.canonicalIngredientId !== item.canonicalIngredientId);
  return <div className="space-y-3 p-4"><div><p className="font-medium">{item.parentDisplayName ? `${item.parentDisplayName} › ` : ""}{item.displayName} {item.catalogStatus === "provisional" ? <span className="text-xs text-amber-700">provisional</span> : null}</p><p className="text-xs text-muted-foreground">{item.usageCount} recipe uses{item.aliases.length ? ` · aliases: ${item.aliases.join(", ")}` : ""}</p></div>
    {item.ingredientKind !== "family" ? <form action={reparent} className="flex gap-2"><input type="hidden" name="canonicalIngredientId" value={item.canonicalIngredientId} /><select name="parentCanonicalIngredientId" defaultValue={item.parentCanonicalIngredientId ?? ""} className="h-9 rounded border bg-background px-2 text-sm"><option value="">No family</option>{families.map((family) => <option key={family.canonicalIngredientId} value={family.canonicalIngredientId}>{family.displayName}</option>)}</select><Button size="sm" variant="outline">Set family</Button></form> : null}
    <form action={merge} className="flex gap-2"><input type="hidden" name="sourceCanonicalIngredientId" value={item.canonicalIngredientId} /><select name="targetCanonicalIngredientId" className="h-9 min-w-0 flex-1 rounded border bg-background px-2 text-sm" defaultValue=""><option value="" disabled>Merge into…</option>{all.filter((entry) => entry.canonicalIngredientId !== item.canonicalIngredientId).map((entry) => <option key={entry.canonicalIngredientId} value={entry.canonicalIngredientId}>{entry.displayName}</option>)}</select><Button size="sm" variant="outline">Merge</Button></form>
  </div>;
}
