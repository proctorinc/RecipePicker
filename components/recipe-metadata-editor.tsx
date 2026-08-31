"use client";

import {
  createContext,
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Bookmark, Check, Hash, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RecipeDescription } from "@/components/recipe-description";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  saveRecipeMetadataAction,
  saveRecipeTagsAction,
} from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { cn } from "@/lib/utils";
import { SAVE_FOR_LATER_TAG_NORMALIZED_NAME } from "@/lib/recipe-tags";

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

const TAG_SUGGESTION_LIMIT = 12;

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
  children: React.ReactNode;
  byline?: React.ReactNode;
  topContent?: React.ReactNode;
  afterDescriptionContent?: React.ReactNode;
  content?: React.ReactNode;
  editBanner?: React.ReactNode;
};

export function RecipeMetadataEditor({
  recipeId,
  title,
  description,
  tags,
  availableTags,
  children,
  byline,
  topContent,
  afterDescriptionContent,
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
  const [displayDescription, setDisplayDescription] = useState(
    description ?? "",
  );
  const [hasContentChanges, setHasContentChanges] = useState(false);
  const [contentResetVersion, setContentResetVersion] = useState(0);
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    saveRecipeMetadataAction,
    initialActionState,
  );
  const formId = `recipe-metadata-${recipeId}`;

  useEffect(() => {
    setDraftTitle(title);
    setDraftDescription(description ?? "");
    setDisplayTitle(title);
    setDisplayDescription(description ?? "");
    setHasContentChanges(false);
  }, [description, title]);

  useEffect(() => {
    if (state.status === "success") {
      setDisplayTitle(draftTitle.trim());
      setDisplayDescription(draftDescription.trim());
      setIsEditing(false);
      setHasContentChanges(false);
      toast.success(state.message);
      router.refresh();
      return;
    }

    if (state.status === "error") {
      toast.error(state.message);
    }
  }, [draftDescription, draftTitle, router, state]);

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

  const hasMetadataChanges =
    draftTitle.trim() !== displayTitle.trim() ||
    draftDescription.trim() !== displayDescription.trim();
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
    setHasContentChanges(false);
    setContentResetVersion((version) => version + 1);
    setSaveChoiceOpen(false);
    setIsEditing(false);
  }

  return (
    <RecipeEditingContext.Provider
      value={{ isEditing, formId, contentResetVersion, setHasContentChanges }}
    >
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
          <div className="relative left-1/2 w-screen -translate-x-1/2">
            {children}
            <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-end p-4 sm:p-6">
              <EditSubmitButton
                isEditing={isEditing}
                pending={pending}
                hasChanges={hasChanges}
                onSave={() => setSaveChoiceOpen(true)}
                onCancel={cancelEditing}
                onEnableEditing={() => {
                  setDraftTitle(displayTitle);
                  setDraftDescription(displayDescription);
                  setHasContentChanges(false);
                  setIsEditing(true);
                }}
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-white sm:p-8">
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
                      "min-h-0 max-w-3xl resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-0",
                      "font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight text-white shadow-none placeholder:text-white/70 focus-visible:ring-0 sm:text-5xl",
                    )}
                  />
                ) : (
                  <h1 className="max-w-3xl whitespace-pre-wrap font-[family-name:var(--font-serif)] text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {displayTitle}
                  </h1>
                )}
              </section>
            </div>
          </div>
        </form>

        <Dialog open={saveChoiceOpen} onOpenChange={setSaveChoiceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save recipe changes</DialogTitle>
              <DialogDescription>
                Choose whether to save these changes to the current version or
                create a new version with them.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-6">
              <button
                type="button"
                disabled={pending}
                onClick={() => save("new")}
                className="self-center text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Create a new version
              </button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => save("update")}
              >
                Save current version
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {editBanner}

        <div className="-mt-4 mx-auto w-full max-w-4xl space-y-2">
          {byline}
          {topContent}
          <RecipeTags
            recipeId={recipeId}
            initialTags={tags}
            availableTags={availableTags}
          />

          <div className="space-y-6">
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
                <RecipeDescription description={displayDescription} />
              ) : null}
            </section>

            {afterDescriptionContent}
            {content}
          </div>
        </div>
      </div>
    </RecipeEditingContext.Provider>
  );
}

function RecipeTags({
  recipeId,
  initialTags,
  availableTags,
}: {
  recipeId: string;
  initialTags: Array<{ tagId: string; name: string }>;
  availableTags: Array<{ tagId: string; name: string }>;
}) {
  const router = useRouter();
  const [tags, setTags] = useState(() => uniqueTagNames(initialTags));
  const [input, setInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [state, saveTags, pending] = useActionState(
    saveRecipeTagsAction,
    initialActionState,
  );
  const [, startSaveTagsTransition] = useTransition();
  const normalizedTags = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
  const suggestions = availableTags
    .filter(
      (tag) =>
        !normalizedTags.has(tag.name.toLocaleLowerCase()) &&
        tag.name.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase()),
    )
    .slice(0, TAG_SUGGESTION_LIMIT);

  useEffect(() => {
    setTags(uniqueTagNames(initialTags));
  }, [initialTags]);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      return;
    }
    if (state.status === "error") toast.error(state.message);
  }, [router, state]);

  function save(nextTags: string[]) {
    const formData = new FormData();
    formData.set("recipeId", recipeId);
    formData.set("tagsJson", JSON.stringify(nextTags));
    setTags(nextTags);
    setSelectedTag(null);
    startSaveTagsTransition(() => {
      saveTags(formData);
    });
  }

  function addTag(raw: string) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || normalizedTags.has(name.toLocaleLowerCase())) {
      setInput("");
      return;
    }
    const existing = availableTags.find(
      (tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    save([...tags, existing?.name ?? name]);
    setInput("");
    setIsAdding(false);
  }

  return (
    <section aria-label="Recipe tags" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            disabled={pending}
            onClick={() =>
              selectedTag === tag
                ? save(tags.filter((value) => value !== tag))
                : setSelectedTag(tag)
            }
            className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/55 px-3 py-1 text-xs font-medium transition hover:bg-secondary"
            aria-label={
              selectedTag === tag ? `Remove ${tag} tag` : `Select ${tag} tag`
            }
          >
            <Icon
              icon={
                tag.toLocaleLowerCase() === SAVE_FOR_LATER_TAG_NORMALIZED_NAME
                  ? Bookmark
                  : Hash
              }
              size="xs"
              className={
                tag.toLocaleLowerCase() === SAVE_FOR_LATER_TAG_NORMALIZED_NAME
                  ? "fill-current"
                  : undefined
              }
            />
            {tag}
            {selectedTag === tag ? <X className="size-3" /> : null}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => setIsAdding((open) => !open)}
          className="inline-flex items-center justify-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Add tag"
        >
          <Icon icon={Plus} size="sm" />
          Tag
        </button>
      </div>
      <Dialog
        open={isAdding}
        onOpenChange={(open) => {
          setIsAdding(open);
          if (!open) setInput("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a tag</DialogTitle>
            <DialogDescription>
              Choose an existing tag or create a new one for this recipe.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              addTag(input);
            }}
          >
            <Input
              autoFocus
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === ",") {
                  event.preventDefault();
                  addTag(input);
                }
              }}
              placeholder="Add a tag"
              aria-label="Tag name"
            />
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2" aria-label="Existing tags">
                {suggestions.map((tag) => (
                  <button
                    key={tag.tagId}
                    type="button"
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/55 px-3 py-1 text-xs font-medium transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => addTag(tag.name)}
                  >
                    <Icon
                      icon={
                        tag.name.toLocaleLowerCase() ===
                        SAVE_FOR_LATER_TAG_NORMALIZED_NAME
                          ? Bookmark
                          : Hash
                      }
                      size="xs"
                      className={
                        tag.name.toLocaleLowerCase() ===
                        SAVE_FOR_LATER_TAG_NORMALIZED_NAME
                          ? "fill-current"
                          : undefined
                      }
                    />
                    {tag.name}
                  </button>
                ))}
              </div>
            ) : input.trim() ? (
              <p className="text-sm text-muted-foreground">
                No existing tags match this search.
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !input.trim()}>
                <Check className="size-4" />
                Add tag
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function uniqueTagNames(tags: Array<{ name: string }>) {
  const names = new Set<string>();

  return tags.reduce<string[]>((uniqueNames, tag) => {
    const normalizedName = tag.name.toLocaleLowerCase();
    if (names.has(normalizedName)) return uniqueNames;

    names.add(normalizedName);
    uniqueNames.push(tag.name);
    return uniqueNames;
  }, []);
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
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={pending || !hasChanges}
          onClick={onSave}
        >
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11 border-white/60 bg-background/85 text-foreground backdrop-blur hover:bg-background"
      disabled={pending}
      aria-label="Edit recipe"
      onClick={() => {
        onEnableEditing();
      }}
    >
      <Pencil className="size-4 shrink-0" />
    </Button>
  );
}
