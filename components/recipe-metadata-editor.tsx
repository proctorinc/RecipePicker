"use client";

import { createContext, useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppTransitionLink } from "@/components/app-transition-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { saveRecipeMetadataAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { cn } from "@/lib/utils";

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

export const RecipeEditingContext = createContext({
  isEditing: false,
  formId: "",
  contentResetVersion: 0,
  setHasContentChanges: (_hasChanges: boolean) => {},
});

type RecipeMetadataEditorProps = {
  recipeId: string;
  title: string;
  description: string | null;
  tags: Array<{ tagId: string; name: string }>;
  availableTags: Array<{ tagId: string; name: string }>;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
  topContent?: React.ReactNode;
  content?: React.ReactNode;
  editBanner?: React.ReactNode;
};

export function RecipeMetadataEditor({
  recipeId,
  title,
  description,
  tags,
  availableTags,
  backHref,
  backLabel,
  children,
  topContent,
  content,
  editBanner,
}: RecipeMetadataEditorProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [displayTitle, setDisplayTitle] = useState(title);
  const [displayDescription, setDisplayDescription] = useState(description ?? "");
  const [draftTags, setDraftTags] = useState(tags.map((tag) => tag.name));
  const [displayTags, setDisplayTags] = useState(tags.map((tag) => tag.name));
  const [hasContentChanges, setHasContentChanges] = useState(false);
  const [contentResetVersion, setContentResetVersion] = useState(0);
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveRecipeMetadataAction, initialActionState);
  const formId = `recipe-metadata-${recipeId}`;

  useEffect(() => {
    setDraftTitle(title);
    setDraftDescription(description ?? "");
    setDisplayTitle(title);
    setDisplayDescription(description ?? "");
    setDraftTags(tags.map((tag) => tag.name));
    setDisplayTags(tags.map((tag) => tag.name));
    setHasContentChanges(false);
  }, [description, tags, title]);

  useEffect(() => {
    if (state.status === "success") {
      setDisplayTitle(draftTitle.trim());
      setDisplayDescription(draftDescription.trim());
      setDisplayTags(draftTags);
      setIsEditing(false);
      setHasContentChanges(false);
      toast.success(state.message);
      router.refresh();
      return;
    }

    if (state.status === "error") {
      toast.error(state.message);
    }
  }, [draftDescription, draftTags, draftTitle, router, state]);

  useLayoutEffect(() => {
    if (!isEditing) {
      return;
    }

    for (const element of [titleRef.current, descriptionRef.current]) {
      if (!element) {
        continue;
      }

      element.style.height = "0px";
      element.style.height = `${element.scrollHeight}px`;
    }
  }, [draftDescription, draftTitle, isEditing]);

  const hasMetadataChanges = draftTitle.trim() !== displayTitle.trim()
    || draftDescription.trim() !== displayDescription.trim()
    || draftTags.join("\u0000") !== displayTags.join("\u0000");
  const hasChanges = hasMetadataChanges || hasContentChanges;

  function save(versionMode: "update" | "new") {
    const form = formRef.current;
    if (!form || !hasChanges) return;
    const formData = new FormData(form);
    formData.set("versionMode", versionMode);
    formAction(formData);
    setSaveChoiceOpen(false);
  }

  function cancelEditing() {
    setDraftTitle(displayTitle);
    setDraftDescription(displayDescription);
    setDraftTags(displayTags);
    setHasContentChanges(false);
    setContentResetVersion((version) => version + 1);
    setSaveChoiceOpen(false);
    setIsEditing(false);
  }

  return (
    <RecipeEditingContext.Provider value={{ isEditing, formId, contentResetVersion, setHasContentChanges }}>
      <div className="contents">
        <form
          id={formId}
          ref={formRef}
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (hasChanges) setSaveChoiceOpen(true);
          }}
        >
          <input type="hidden" name="recipeId" value={recipeId} />
          <input type="hidden" name="tagsJson" value={JSON.stringify(draftTags)} />
          <div className="sticky top-[5.25rem] z-30 rounded-full border border-white/80 bg-background/90 px-1 py-1 shadow-soft backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <Button asChild variant="outline">
                <AppTransitionLink href={backHref} prefetch>
                  <ArrowLeft className="size-4" />
                  {backLabel}
                </AppTransitionLink>
              </Button>
              <EditSubmitButton
                isEditing={isEditing}
                pending={pending}
                hasChanges={hasChanges}
                onSave={() => setSaveChoiceOpen(true)}
                onCancel={cancelEditing}
                onEnableEditing={() => {
                  setDraftTitle(displayTitle);
                  setDraftDescription(displayDescription);
                  setDraftTags(displayTags);
                  setHasContentChanges(false);
                  setIsEditing(true);
                }}
              />
            </div>
          </div>
        </form>

        <Dialog open={saveChoiceOpen} onOpenChange={setSaveChoiceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save recipe changes</DialogTitle>
              <DialogDescription>Choose whether to save these changes to the current version or create a new version with them.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={pending} onClick={() => save("update")}>Save current version</Button>
              <Button type="button" disabled={pending} onClick={() => save("new")}>Create a new version</Button>
            </div>
          </DialogContent>
        </Dialog>

        {children}
        {editBanner}

        <div className="space-y-2 px-4">
          <section>
            {isEditing ? (
              <Textarea
                ref={titleRef}
                form={formId}
                name="title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Add a recipe title"
                rows={2}
                className={cn(
                  "min-h-0 resize-none overflow-hidden rounded-none border-0 bg-secondary/35 px-0 py-0",
                  "font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight text-foreground shadow-none focus-visible:ring-0 sm:text-5xl",
                )}
              />
            ) : (
              <h2 className="max-w-3xl whitespace-pre-wrap font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight sm:text-5xl">
                {displayTitle}
              </h2>
            )}
          </section>

          <RecipeTags
            tags={isEditing ? draftTags : displayTags}
            availableTags={availableTags}
            editable={isEditing}
            onChange={setDraftTags}
          />

          <section>
            {isEditing ? (
              <Textarea
                ref={descriptionRef}
                form={formId}
                name="description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="Add a short description for this recipe."
                rows={4}
                className="min-h-[7.5rem] resize-none overflow-hidden rounded-none border-0 bg-secondary/30 px-0 py-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0 sm:text-base"
              />
            ) : displayDescription.trim() ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground sm:text-base">
                {displayDescription}
              </p>
            ) : null}
          </section>

          {topContent}
          {content}
        </div>
      </div>
    </RecipeEditingContext.Provider>
  );
}

function RecipeTags({
  tags,
  availableTags,
  editable,
  onChange,
}: {
  tags: string[];
  availableTags: Array<{ tagId: string; name: string }>;
  editable: boolean;
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const normalizedTags = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
  const suggestions = availableTags.filter((tag) =>
    !normalizedTags.has(tag.name.toLocaleLowerCase())
    && tag.name.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase()),
  ).slice(0, 6);

  function addTag(raw: string) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || normalizedTags.has(name.toLocaleLowerCase())) {
      setInput("");
      return;
    }
    const existing = availableTags.find((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    onChange([...tags, existing?.name ?? name]);
    setInput("");
  }

  if (!editable && tags.length === 0) return null;

  return (
    <section aria-label="Recipe tags" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => editable ? (
          <button key={tag} type="button" onClick={() => onChange(tags.filter((value) => value !== tag))} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/55 px-3 py-1 text-xs font-medium transition hover:bg-secondary" aria-label={`Remove ${tag} tag`}>
            <Tag className="size-3" />{tag}<X className="size-3" />
          </button>
        ) : (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/55 px-3 py-1 text-xs font-medium"><Tag className="size-3" />{tag}</span>
        ))}
      </div>
      {editable ? (
        <div className="relative max-w-md">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag(input);
              }
            }}
            onBlur={() => { if (input.trim()) addTag(input); }}
            placeholder="Add a tag"
            aria-label="Add a tag"
          />
          {input.trim() && suggestions.length > 0 ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
              {suggestions.map((tag) => <button key={tag.tagId} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary" onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(tag.name)}>{tag.name}</button>)}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EditSubmitButton({
  isEditing,
  pending,
  hasChanges,
  onSave,
  onCancel,
  onEnableEditing,
}: {
  isEditing: boolean;
  pending: boolean;
  hasChanges: boolean;
  onSave: () => void;
  onCancel: () => void;
  onEnableEditing: () => void;
}) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={pending || !hasChanges} onClick={onSave}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => {
        onEnableEditing();
      }}
    >
      <Pencil className="size-4" />
      {pending ? "Saving..." : "Edit"}
    </Button>
  );
}
