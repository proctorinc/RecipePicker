"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { createCustomRecipeAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Board = { boardId: string; name: string };
type RecipeDraft = {
  title: string; description: string; sourceUrl: string; imageUrl: string;
  yieldText: string; prepTime: string; cookTime: string; totalTime: string;
  ingredients: string; steps: string;
};

const emptyDraft: RecipeDraft = {
  title: "", description: "", sourceUrl: "", imageUrl: "", yieldText: "", prepTime: "", cookTime: "", totalTime: "", ingredients: "", steps: "",
};
const initialState: ActionState = { status: "idle", message: "" };
const DRAFT_STORAGE_KEY = "recipe-picker:create-recipe-draft:v1";

export function CustomRecipeForm({ boards, canPublish }: { boards: Board[]; canPublish: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<RecipeDraft>(emptyDraft);
  const [file, setFile] = useState<File | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [publishToPinterest, setPublishToPinterest] = useState(false);
  const [boardId, setBoardId] = useState("");
  const hasLoadedDraft = useRef(false);
  const [state, formAction, pending] = useActionState(createCustomRecipeAction, initialState);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<{ draft: RecipeDraft; importUrl: string; publishToPinterest: boolean; boardId: string }>;
        if (parsed.draft) setDraft({ ...emptyDraft, ...parsed.draft });
        if (typeof parsed.importUrl === "string") setImportUrl(parsed.importUrl);
        if (typeof parsed.publishToPinterest === "boolean") setPublishToPinterest(parsed.publishToPinterest);
        if (typeof parsed.boardId === "string") setBoardId(parsed.boardId);
      }
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      hasLoadedDraft.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedDraft.current) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft, importUrl, publishToPinterest, boardId }));
  }, [boardId, draft, importUrl, publishToPinterest]);

  useEffect(() => {
    if (state.status === "error") toast.error(state.message);
    if (state.status === "success" && typeof state.data?.recipeId === "string") {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.success(state.message);
      router.push(`/recipe/${state.data.recipeId}`);
    }
  }, [router, state]);

  function update(field: keyof RecipeDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function importRecipe() {
    setIsImporting(true);
    try {
      const response = await fetch("/api/recipes/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: importUrl }),
      });
      const result = await response.json() as Partial<RecipeDraft> & { ingredients?: string[]; steps?: string[]; message?: string };
      if (!response.ok) throw new Error(result.message || "Unable to import that recipe.");
      setDraft({
        ...emptyDraft,
        ...result,
        sourceUrl: result.sourceUrl || importUrl,
        ingredients: result.ingredients?.join("\n") || "",
        steps: result.steps?.join("\n") || "",
      });
      setFile(null);
      toast.success("Recipe imported. Review the details before publishing.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to import that recipe.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Tabs defaultValue="manual">
      <TabsList>
        <TabsTrigger value="manual">Enter manually</TabsTrigger>
        <TabsTrigger value="url">Import from URL</TabsTrigger>
      </TabsList>
      <TabsContent value="url">
        <Card className="bg-white/85">
          <CardHeader><CardTitle>Import a recipe</CardTitle><CardDescription>We&apos;ll pull in the recipe, then you can review every detail before it is published.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://example.com/recipe" type="url" />
            <Button type="button" onClick={importRecipe} disabled={isImporting || !importUrl.trim()}>
              {isImporting ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
              {isImporting ? "Importing…" : "Import"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="manual"><p className="text-sm text-muted-foreground">Add the recipe details below, then choose its Pinterest board.</p></TabsContent>

      <form action={formAction} className="mt-6 space-y-6">
        <Card className="bg-white/85"><CardHeader><CardTitle>Recipe details</CardTitle></CardHeader><CardContent className="grid gap-4">
          <Input name="title" value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="Recipe title" required />
          <Textarea name="description" value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="A short description (optional)" />
          <Input name="sourceUrl" value={draft.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="Original recipe URL (optional)" type="url" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input name="yieldText" value={draft.yieldText} onChange={(event) => update("yieldText", event.target.value)} placeholder="Servings" />
            <Input name="prepTime" value={draft.prepTime} onChange={(event) => update("prepTime", event.target.value)} placeholder="Prep time (PT15M)" />
            <Input name="cookTime" value={draft.cookTime} onChange={(event) => update("cookTime", event.target.value)} placeholder="Cook time (PT30M)" />
            <Input name="totalTime" value={draft.totalTime} onChange={(event) => update("totalTime", event.target.value)} placeholder="Total time (PT45M)" />
          </div>
        </CardContent></Card>

        <Card className="bg-white/85"><CardHeader><CardTitle>Image</CardTitle><CardDescription>JPG, PNG, or WebP up to 10 MB.</CardDescription></CardHeader><CardContent className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[22px] border border-dashed border-border bg-secondary/25 px-4 py-8 text-sm font-medium"><ImagePlus className="size-5" />{file ? file.name : "Choose an image"}<input name="image" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <input type="hidden" name="imageUrl" value={draft.imageUrl} />
          {draft.imageUrl && !file ? <img src={draft.imageUrl} alt="Imported recipe" className="h-48 w-full rounded-[22px] object-cover" /> : null}
        </CardContent></Card>

        <div className="grid gap-6 lg:grid-cols-2"><Card className="bg-white/85"><CardHeader><CardTitle>Ingredients</CardTitle><CardDescription>One ingredient per line.</CardDescription></CardHeader><CardContent><Textarea value={draft.ingredients} onChange={(event) => update("ingredients", event.target.value)} className="min-h-64" placeholder="2 cups flour\n1 tsp salt" required /><input type="hidden" name="ingredientsJson" value={JSON.stringify(draft.ingredients.split("\n"))} /></CardContent></Card>
          <Card className="bg-white/85"><CardHeader><CardTitle>Instructions</CardTitle><CardDescription>One step per line.</CardDescription></CardHeader><CardContent><Textarea value={draft.steps} onChange={(event) => update("steps", event.target.value)} className="min-h-64" placeholder="Preheat the oven.\nMix the ingredients." required /><input type="hidden" name="stepsJson" value={JSON.stringify(draft.steps.split("\n"))} /></CardContent></Card></div>

        <Card className="bg-white/85"><CardHeader><CardTitle>Pinterest</CardTitle><CardDescription>Save this as a personal recipe, or publish it to a synced Pinterest board now.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
          <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={publishToPinterest} onChange={(event) => setPublishToPinterest(event.target.checked)} disabled={!canPublish || boards.length === 0} /> Publish to Pinterest</label>
          {publishToPinterest ? <select name="boardId" required value={boardId} onChange={(event) => setBoardId(event.target.value)} className="h-12 rounded-full border border-border bg-background px-5 text-sm"><option value="">Choose a synced board</option>{boards.map((board) => <option key={board.boardId} value={board.boardId}>{board.name}</option>)}</select> : <input type="hidden" name="boardId" value="" />}
          <div className="flex flex-wrap items-center gap-3"><Button disabled={pending}>{pending ? (publishToPinterest ? "Publishing…" : "Saving…") : (publishToPinterest ? "Publish recipe" : "Save personal recipe")}</Button>{!canPublish ? <p className="text-sm text-muted-foreground">Reconnect Pinterest with publishing permission to post recipes.</p> : boards.length === 0 ? <p className="text-sm text-muted-foreground">Enable a Pinterest board in Settings to post recipes.</p> : null}</div>
        </CardContent></Card>
      </form>
    </Tabs>
  );
}
