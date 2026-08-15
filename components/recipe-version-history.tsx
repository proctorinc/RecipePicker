"use client";

import { useActionState, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

import { createRecipeVersionAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import type { RecipeVersionView } from "@/types/view-models";
import { RecipeEditingContext } from "@/components/recipe-metadata-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = { status: "idle", message: "" };

export function RecipeVersionHistory({ recipeId, versions, variant = "indicators" }: { recipeId: string; versions: RecipeVersionView[]; variant?: "indicators" | "create" }) {
  const primary = versions.at(-1);
  const isEditing = useContext(RecipeEditingContext);
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createRecipeVersionAction, initialState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      setOpen(false);
    } else if (state.status === "error") toast.error(state.message);
  }, [state]);

  if ((variant === "create" && !isEditing) || (variant === "indicators" && versions.length <= 1 && !isEditing)) {
    return null;
  }

  return (
    <div className={variant === "create" ? "mx-4 rounded-2xl border border-border/60 bg-secondary/25 px-3 py-2" : "flex flex-wrap items-center gap-1.5"}>
      {variant === "indicators" ? versions.map((version) => <Badge key={version.versionNumber} variant="outline" className="border-0 bg-white/18 px-4 py-2 text-sm font-normal text-white backdrop-blur">v{version.versionNumber}{version.isPrimary ? " · current" : ""}</Badge>) : null}
      {isEditing ? <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button type="button" size="sm" variant={variant === "create" ? "outline" : "secondary"} className={variant === "create" ? "h-7 rounded-full px-2.5 text-xs" : "h-6 rounded-full px-2 text-xs"}>Create new version</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create version {(primary?.versionNumber ?? 1) + 1}</DialogTitle><DialogDescription>Start from the current recipe and change ingredient lines as needed. This keeps every prior version unchanged.</DialogDescription></DialogHeader>
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="recipeId" value={recipeId} />
              <label className="block space-y-2"><span className="text-sm font-medium">Ingredients (one per line)</span><Textarea name="ingredientLines" defaultValue={primary?.ingredients.join("\n")} className="min-h-52" required /></label>
              <label className="block space-y-2"><span className="text-sm font-medium">What changed? (optional)</span><Textarea name="note" placeholder="Example: Swapped dairy milk for oat milk" /></label>
              <Button type="submit">Save as new version</Button>
            </form>
          </DialogContent>
        </Dialog> : null}
    </div>
  );
}
