"use client";

import { createContext, useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppTransitionLink } from "@/components/app-transition-link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveRecipeMetadataAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";
import { cn } from "@/lib/utils";

const initialActionState: ActionState = {
  status: "idle",
  message: "",
};

export const RecipeEditingContext = createContext(false);

type RecipeMetadataEditorProps = {
  recipeId: string;
  title: string;
  description: string | null;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
  content?: React.ReactNode;
  editBanner?: React.ReactNode;
};

export function RecipeMetadataEditor({
  recipeId,
  title,
  description,
  backHref,
  backLabel,
  children,
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
  const [state, formAction, pending] = useActionState(saveRecipeMetadataAction, initialActionState);

  useEffect(() => {
    setDraftTitle(title);
    setDraftDescription(description ?? "");
    setDisplayTitle(title);
    setDisplayDescription(description ?? "");
  }, [description, title]);

  useEffect(() => {
    if (state.status === "success") {
      setDisplayTitle(draftTitle.trim());
      setDisplayDescription(draftDescription.trim());
      setIsEditing(false);
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

  return (
    <RecipeEditingContext.Provider value={isEditing}>
    <form
      ref={formRef}
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        formAction(new FormData(event.currentTarget));
      }}
    >
      <input type="hidden" name="recipeId" value={recipeId} />
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
            onSave={() => formRef.current?.requestSubmit()}
            onEnableEditing={() => {
              setDraftTitle(displayTitle);
              setDraftDescription(displayDescription);
              setIsEditing(true);
            }}
          />
        </div>
      </div>

      {children}
      {editBanner}

      <div className="space-y-2 px-4">
        <section>
          {isEditing ? (
            <Textarea
              ref={titleRef}
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

        <section>
          {isEditing ? (
            <Textarea
              ref={descriptionRef}
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

        {content}
      </div>
    </form>
    </RecipeEditingContext.Provider>
  );
}

function EditSubmitButton({
  isEditing,
  pending,
  onSave,
  onEnableEditing,
}: {
  isEditing: boolean;
  pending: boolean;
  onSave: () => void;
  onEnableEditing: () => void;
}) {
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => {
        if (isEditing) {
          onSave();
          return;
        }

        onEnableEditing();
      }}
    >
      {!isEditing ? <Pencil className="size-4" /> : null}
      {pending ? "Saving..." : isEditing ? "Save" : "Edit"}
    </Button>
  );
}
