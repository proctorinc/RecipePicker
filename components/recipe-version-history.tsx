"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { createRecipeVersionAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import type { RecipeVersionView } from "@/types/view-models";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = { status: "idle", message: "" };

export function RecipeVersionHistory({ recipeId, versions }: { recipeId: string; versions: RecipeVersionView[] }) {
  const primary = versions.at(-1);
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createRecipeVersionAction, initialState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      setOpen(false);
    } else if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <Card className="bg-white/85">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Recipe versions</CardTitle>
          <CardDescription>Version {primary?.versionNumber ?? 1} is the recipe shown above and used for new ratings.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="outline">Create new version</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create version {(primary?.versionNumber ?? 1) + 1}</DialogTitle><DialogDescription>Start from the current recipe and change ingredient lines as needed. This keeps every prior version unchanged.</DialogDescription></DialogHeader>
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="recipeId" value={recipeId} />
              <label className="block space-y-2"><span className="text-sm font-medium">Ingredients (one per line)</span><Textarea name="ingredientLines" defaultValue={primary?.ingredients.join("\n")} className="min-h-52" required /></label>
              <label className="block space-y-2"><span className="text-sm font-medium">What changed? (optional)</span><Textarea name="note" placeholder="Example: Swapped dairy milk for oat milk" /></label>
              <Button type="submit">Save as new version</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {[...versions].reverse().map((version) => (
          <article key={version.versionNumber} className="rounded-[20px] border border-border/60 bg-secondary/15 p-4">
            <div className="flex flex-wrap items-center gap-2"><p className="font-medium">Version {version.versionNumber}</p>{version.isPrimary ? <Badge>Primary</Badge> : null}{version.createdAt ? <span className="text-sm text-muted-foreground">{formatDate(version.createdAt)}</span> : null}</div>
            {version.note ? <p className="mt-2 text-sm text-muted-foreground">{version.note}</p> : null}
            {version.versionNumber > 1 ? <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><ChangeList label="Added" values={version.changes.added} tone="text-emerald-700" /><ChangeList label="Removed" values={version.changes.removed} tone="text-rose-700" /></div> : <p className="mt-2 text-sm text-muted-foreground">Original version</p>}
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

function ChangeList({ label, values, tone }: { label: string; values: string[]; tone: string }) {
  return <div><p className={`font-medium ${tone}`}>{label}</p>{values.length ? <ul className="mt-1 list-disc pl-5 text-muted-foreground">{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p className="text-muted-foreground">None</p>}</div>;
}
