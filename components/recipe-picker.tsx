"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  Search,
  Settings2,
  Sparkles,
  ThumbsUp,
} from "lucide-react";

import { RecipeImage } from "@/components/recipe-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatRatingValue } from "@/lib/utils";
import type {
  RecipePickerCard,
  RecipePickerChatMessage,
  RecipePickerConversationSummary,
  RecipePickerMessageSegment,
  RecipePickerMode,
  RecipePickerRequest,
  RecipePickerResponse,
} from "@/types/recipe-picker";

type RecipePickerProps = {
  initialState: RecipePickerResponse;
};

const promptExamples = [
  "easy weeknight chicken dinner",
  "healthy salad with protein",
  "more like the shrimp one",
];

export function RecipePicker({ initialState }: RecipePickerProps) {
  const [prompt, setPrompt] = useState("");
  const [picker, setPicker] = useState(initialState);
  const [mode] = useState<RecipePickerMode>("v1");
  const [selectedAssistantMessageId, setSelectedAssistantMessageId] = useState(
    initialState.activeMessageId,
  );
  const [visibleRecipes, setVisibleRecipes] = useState<RecipePickerCard[]>(
    initialState.recipes,
  );
  const [visiblePinnedRecipeIds, setVisiblePinnedRecipeIds] = useState<
    string[]
  >(initialState.pinnedRecipeIds);
  const [activeIndex, setActiveIndex] = useState(initialState.activeIndex);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(initialState.activeIndex);

  const messages = picker.messages;
  const threadSummaries = picker.threadSummaries;
  const activeRecipe = visibleRecipes[activeIndex] ?? null;
  const selectedAssistantMessage = useMemo(
    () =>
      messages.find(
        (entry) =>
          entry.messageId === selectedAssistantMessageId &&
          entry.role === "assistant",
      ) ?? null,
    [messages, selectedAssistantMessageId],
  );

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const scroller = carouselRef.current;
    if (!scroller) {
      return;
    }

    function updateActiveSlide() {
      if (!scroller) {
        return;
      }

      const firstCard =
        scroller.querySelector<HTMLElement>("[data-recipe-card]");
      if (!firstCard) {
        return;
      }

      const stride = firstCard.offsetWidth + resolveScrollerGap(scroller);
      const nextIndex = Math.round(scroller.scrollLeft / stride);
      const boundedIndex = Math.max(
        0,
        Math.min(visibleRecipes.length - 1, nextIndex),
      );

      if (boundedIndex !== activeIndexRef.current) {
        activeIndexRef.current = boundedIndex;
        setActiveIndex(boundedIndex);
      }
    }

    updateActiveSlide();
    scroller.addEventListener("scroll", updateActiveSlide, { passive: true });

    return () => {
      scroller.removeEventListener("scroll", updateActiveSlide);
    };
  }, [visibleRecipes.length]);

  function hydrateFromAssistantMessage(
    nextPicker: RecipePickerResponse,
    assistantMessageId: string | null,
  ) {
    const nextAssistant =
      nextPicker.messages.find(
        (entry) =>
          entry.messageId === assistantMessageId && entry.role === "assistant",
      ) ??
      [...nextPicker.messages]
        .reverse()
        .find((entry) => entry.role === "assistant") ??
      null;
    const nextRecipes = nextAssistant?.recipeSnapshot ?? nextPicker.recipes;
    const nextPinnedRecipeIds =
      nextAssistant?.pinnedRecipeIds ?? nextPicker.pinnedRecipeIds;
    const nextIndex = resolveActiveIndex(
      nextRecipes,
      nextAssistant?.activeRecipeId ?? null,
      nextPicker.activeIndex,
    );

    setPicker(nextPicker);
    setSelectedAssistantMessageId(nextAssistant?.messageId ?? null);
    setVisibleRecipes(nextRecipes);
    setVisiblePinnedRecipeIds(nextPinnedRecipeIds);
    setActiveIndex(nextIndex);
    activeIndexRef.current = nextIndex;
  }

  async function submitPrompt(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await submitSpecificPrompt(prompt);
  }

  async function submitSpecificPrompt(nextPromptValue: string) {
    const trimmedPrompt = nextPromptValue.trim();

    if (picker.requiresAiSetup) {
      setMessage(
        "Connect the household AI in Settings before prompting the picker.",
      );
      return;
    }

    if (!trimmedPrompt) {
      setMessage("Enter a prompt to refine the recipe set.");
      return;
    }

    const payload: RecipePickerRequest = {
      mode,
      prompt: trimmedPrompt,
      conversationId: picker.conversationId,
      currentSetRecipeIds: visibleRecipes.map((recipe) => recipe.recipeId),
      pinnedRecipeIds: visiblePinnedRecipeIds,
      activeRecipeId: activeRecipe?.recipeId ?? null,
    };

    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/recipe-picker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setMessage("Unable to update the recipe picker right now.");
        return;
      }

      const nextPicker = (await response.json()) as RecipePickerResponse;
      hydrateFromAssistantMessage(nextPicker, nextPicker.activeMessageId);
      setPrompt("");
    });
  }

  function togglePin(recipeId: string) {
    setVisiblePinnedRecipeIds((current) =>
      current.includes(recipeId)
        ? current.filter((id) => id !== recipeId)
        : [...current, recipeId],
    );
    setVisibleRecipes((current) =>
      current.map((recipe) =>
        recipe.recipeId === recipeId
          ? {
              ...recipe,
              isPinned: !recipe.isPinned,
            }
          : recipe,
      ),
    );
  }

  function move(direction: -1 | 1) {
    if (visibleRecipes.length === 0) {
      return;
    }

    const nextIndex =
      (activeIndex + direction + visibleRecipes.length) % visibleRecipes.length;
    scrollToCard(nextIndex);
  }

  function scrollToCard(index: number) {
    const scroller = carouselRef.current;
    if (!scroller) {
      return;
    }

    const firstCard = scroller.querySelector<HTMLElement>("[data-recipe-card]");
    if (!firstCard) {
      return;
    }

    const stride = firstCard.offsetWidth + resolveScrollerGap(scroller);
    scroller.scrollTo({
      left: index * stride,
      behavior: "smooth",
    });
  }

  function selectAssistantMessage(entry: RecipePickerChatMessage) {
    if (entry.role !== "assistant") {
      return;
    }

    setSelectedAssistantMessageId(entry.messageId);
    setVisibleRecipes(entry.recipeSnapshot ?? []);
    setVisiblePinnedRecipeIds(entry.pinnedRecipeIds);
    const nextIndex = resolveActiveIndex(
      entry.recipeSnapshot ?? [],
      entry.activeRecipeId,
      0,
    );
    setActiveIndex(nextIndex);
    activeIndexRef.current = nextIndex;
    setMessage("");
  }

  function loadConversation(conversationId: string) {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(
        `/api/recipe-picker/conversations/${conversationId}`,
      );
      if (!response.ok) {
        setMessage("Unable to load that conversation right now.");
        return;
      }

      const nextPicker = (await response.json()) as RecipePickerResponse;
      hydrateFromAssistantMessage(nextPicker, nextPicker.activeMessageId);
    });
  }

  function createConversation() {
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/recipe-picker/conversations", {
        method: "POST",
      });
      if (!response.ok) {
        setMessage("Unable to start a new chat right now.");
        return;
      }

      const nextPicker = (await response.json()) as RecipePickerResponse;
      hydrateFromAssistantMessage(nextPicker, nextPicker.activeMessageId);
      setPrompt("");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-3 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <Button
          type="button"
          onClick={createConversation}
          className="w-full justify-start bg-stone-950 text-white hover:bg-stone-900"
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="h-4 w-4" />
          )}
          New chat
        </Button>

        <div className="rounded-[28px] border border-white/70 bg-white/75 p-3 shadow-sm">
          <p className="px-2 pb-2 text-xs uppercase tracking-[0.24em] text-stone-400">
            Saved chats
          </p>
          <div className="space-y-2">
            {threadSummaries.map((thread) => (
              <button
                key={thread.conversationId}
                type="button"
                onClick={() => loadConversation(thread.conversationId)}
                className={cn(
                  "w-full rounded-[22px] border px-3 py-3 text-left transition hover:bg-white",
                  picker.conversationId === thread.conversationId
                    ? "border-stone-300 bg-white shadow-sm"
                    : "border-transparent bg-stone-50/80",
                )}
              >
                <p className="line-clamp-2 flex-wrap text-sm font-medium text-stone-900">
                  {thread.title}
                </p>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="space-y-6">
        <section
          className="relative"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              move(-1);
            }
            if (event.key === "ArrowRight") {
              move(1);
            }
          }}
        >
          <div className="mb-5 flex items-center justify-between gap-3 px-4">
            <div>
              <h3 className="font-[family-name:var(--font-serif)] text-2xl font-semibold text-stone-900">
                Suggested recipes
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => move(-1)}
                disabled={visibleRecipes.length < 2}
              >
                <ChevronLeft className="size-6" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => move(1)}
                disabled={visibleRecipes.length < 2}
              >
                <ChevronRight className="size-6" />
              </Button>
            </div>
          </div>

          {visibleRecipes.length > 0 ? (
            <>
              <div
                ref={carouselRef}
                className="recipe-picker-scroll flex gap-4 overflow-x-auto p-4 snap-x snap-mandatory overscroll-x-contain [-ms-overflow-style:none] [perspective:1600px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-6 sm:pl-6"
              >
                {visibleRecipes.map((recipe, index) => {
                  const offset = index - activeIndex;
                  const absOffset = Math.abs(offset);
                  const rotateY = offset * -16;
                  const scale =
                    absOffset === 0 ? 1 : Math.max(0.82, 1 - absOffset * 0.08);
                  const translateY =
                    absOffset === 0 ? 0 : Math.min(18, absOffset * 8);

                  return (
                    <button
                      key={recipe.recipeId}
                      data-recipe-card
                      type="button"
                      className="h-[25rem] w-[84%] max-w-[28rem] min-w-[18rem] shrink-0 snap-start text-left transition duration-300 ease-out sm:w-[72%] md:w-[28rem]"
                      style={{
                        transform: `translateY(${translateY}px) rotateY(${rotateY}deg) scale(${scale})`,
                        zIndex: Math.max(1, 30 - absOffset),
                      }}
                      onClick={() => scrollToCard(index)}
                      aria-pressed={index === activeIndex}
                    >
                      <Card
                        className={cn(
                          "h-full overflow-hidden border-white/70 bg-white shadow-[0_30px_70px_rgba(75,52,26,0.18)] transition",
                          index === activeIndex ? "ring-2 ring-stone-300" : "",
                        )}
                      >
                        <div className="relative h-full">
                          <div className="relative h-44 overflow-hidden bg-stone-200">
                            {recipe.imageUrl ? (
                              <RecipeImage
                                src={recipe.imageUrl}
                                previewSrc={recipe.previewImageUrl}
                                alt={recipe.title}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 84vw, 28rem"
                              />
                            ) : null}
                            {!recipe.imageUrl ? (
                              <div className="flex h-full items-end bg-[linear-gradient(135deg,#d7c6b0,#f2ebe1)] p-5">
                                <p className="font-[family-name:var(--font-serif)] text-2xl font-semibold text-stone-800">
                                  {recipe.title}
                                </p>
                              </div>
                            ) : (
                              <div className="flex h-full items-end bg-[linear-gradient(180deg,transparent,rgba(37,23,12,0.75))] p-5">
                                <p className="font-[family-name:var(--font-serif)] text-2xl font-semibold text-white">
                                  {recipe.title}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex h-[calc(100%-11rem)] flex-col gap-4 p-5">
                            <div className="flex flex-wrap items-center gap-2">
                              {recipe.siteName ? (
                                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                                  {recipe.siteName}
                                </span>
                              ) : null}
                              {recipe.isPinned ? (
                                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                  Pinned
                                </span>
                              ) : null}
                              {recipe.reviewCount > 0 ? (
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                                  {formatRatingValue(recipe.averageRating)}{" "}
                                  stars · {recipe.reviewCount} review
                                  {recipe.reviewCount === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </div>

                            <p className="line-clamp-3 text-sm leading-6 text-stone-700">
                              {recipe.shortDescription ??
                                "Saved to your household recipe collection."}
                            </p>

                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-[0.28em] text-stone-400">
                                Why it fits
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {recipe.matchedReasons.map((reason) => (
                                  <span
                                    key={reason}
                                    className="rounded-full bg-stone-950 px-3 py-1 text-xs font-medium text-white"
                                  >
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="mt-auto flex items-center justify-between gap-3">
                              <Button
                                type="button"
                                variant={
                                  recipe.isPinned ? "default" : "outline"
                                }
                                className={
                                  recipe.isPinned
                                    ? "bg-stone-950 text-white hover:bg-stone-900"
                                    : ""
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  togglePin(recipe.recipeId);
                                }}
                              >
                                <ThumbsUp className="h-4 w-4" />
                                {recipe.isPinned ? "Pinned" : "Thumbs up"}
                              </Button>
                              <Button
                                asChild
                                variant="ghost"
                                className="text-stone-700"
                              >
                                <Link href={`/recipe/${recipe.recipeId}`}>
                                  View recipe
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-center gap-2">
                {visibleRecipes.map((recipe, index) => (
                  <button
                    key={recipe.recipeId}
                    type="button"
                    className={cn(
                      "h-2.5 rounded-full bg-stone-300 transition-all",
                      index === activeIndex
                        ? "w-10 bg-white shadow-[0_0_0_1px_rgba(120,92,62,0.1)]"
                        : "w-2.5",
                    )}
                    onClick={() => scrollToCard(index)}
                    aria-label={`Jump to ${recipe.title}`}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-[28px] border border-dashed border-white/80 bg-white/70 px-6 py-12 text-center text-sm text-muted-foreground">
              Ask the AI for a dish, ingredient, or mood to start building this
              conversation.
            </div>
          )}
        </section>

        <section className="mx-auto max-w-4xl space-y-4">
          {messages.length === 0 ? (
            <div className="rounded-[28px] border border-white/70 bg-white/75 px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
              This chat is empty. Start with a prompt and the AI will save the
              conversation here.
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((entry) => {
                const isAssistant = entry.role === "assistant";
                const isSelected =
                  entry.messageId === selectedAssistantMessageId;

                return (
                  <div
                    key={entry.messageId}
                    className={cn(
                      "flex",
                      isAssistant ? "justify-start" : "justify-end",
                    )}
                  >
                    <div
                      onClick={
                        isAssistant
                          ? () => selectAssistantMessage(entry)
                          : undefined
                      }
                      onKeyDown={
                        isAssistant
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                selectAssistantMessage(entry);
                              }
                            }
                          : undefined
                      }
                      role={isAssistant ? "button" : undefined}
                      tabIndex={isAssistant ? 0 : undefined}
                      className={cn(
                        "max-w-[92%] rounded-[28px] border px-4 py-3 text-left shadow-sm transition",
                        isAssistant
                          ? "border-white/70 bg-white/85 hover:bg-white"
                          : "border-stone-950 bg-stone-950 text-white hover:bg-stone-900",
                        isAssistant && isSelected
                          ? "ring-2 ring-stone-300"
                          : "",
                      )}
                    >
                      <div className="space-y-3">
                        <div
                          className={cn(
                            "text-sm leading-6",
                            isAssistant ? "text-stone-800" : "text-white",
                          )}
                        >
                          <MessageSegments
                            segments={entry.segments}
                            isAssistant={isAssistant}
                          />
                        </div>

                        {isAssistant &&
                        entry.recipeSnapshot &&
                        entry.recipeSnapshot.length > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            <p className="mb-2 uppercase tracking-[0.24em] text-stone-400">
                              Suggested recipes
                            </p>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                              {entry.recipeSnapshot.map((recipe) =>
                                recipe.imageUrl ? (
                                  <div
                                    key={recipe.recipeId}
                                    className="relative w-20 h-32 flex-shrink-0 overflow-hidden rounded-md"
                                  >
                                    <RecipeImage
                                      src={recipe.imageUrl}
                                      previewSrc={recipe.previewImageUrl}
                                      alt={recipe.title}
                                      fill
                                      className="object-cover"
                                    />
                                  </div>
                                ) : null,
                              )}
                            </div>
                            {/*<div className="flex flex-wrap gap-x-3 gap-y-2">
                              {entry.recipeSnapshot.map((recipe) => (
                                <span
                                  key={recipe.recipeId}
                                  className="inline-flex items-center gap-2"
                                >
                                  <Link
                                    href={`/recipe/${recipe.recipeId}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
                                  >
                                    {recipe.title}
                                  </Link>
                                  {recipe.siteName ? (
                                    <span>{recipe.siteName}</span>
                                  ) : null}
                                </span>
                              ))}
                            </div>*/}
                          </div>
                        ) : null}

                        {isAssistant &&
                        isSelected &&
                        entry.suggestedPrompts.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {entry.suggestedPrompts.map((suggestion) => (
                              <Button
                                key={`${entry.messageId}-${suggestion}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-full border-stone-200 bg-white/90 text-stone-700"
                                disabled={isPending}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPrompt(suggestion);
                                  void submitSpecificPrompt(suggestion);
                                }}
                              >
                                {suggestion}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="">
          <div className="mx-auto max-w-3xl">
            <form onSubmit={submitPrompt} className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask for a vibe, ingredient, or follow-up"
                className="h-14 border-white/80 bg-white/92 pl-11 pr-32 text-base shadow-[0_18px_40px_rgba(54,40,25,0.12)] backdrop-blur"
              />
              <Button
                type="submit"
                size="sm"
                className="absolute right-1.5 top-1/2 h-11 -translate-y-1/2 bg-stone-950 px-4 text-white hover:bg-stone-900"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Ask AI
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap items-center gap-2 px-2 text-xs text-muted-foreground">
              {promptExamples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="rounded-full border border-white/70 bg-white/70 px-3 py-1.5 transition hover:bg-white"
                >
                  {example}
                </button>
              ))}
            </div>
            {picker.requiresAiSetup ? (
              <div className="mt-3 flex flex-col gap-3 rounded-[28px] border border-amber-200/70 bg-amber-50/95 px-4 py-4 text-sm text-stone-800 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Connect the household AI in Settings before prompting the
                  picker.
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="border-stone-300 bg-white"
                >
                  <Link href="/settings/ai">
                    <Settings2 className="h-4 w-4" />
                    Open AI settings
                  </Link>
                </Button>
              </div>
            ) : null}
            {message ? (
              <div className="mt-3 rounded-[22px] border border-white/80 bg-white/85 px-4 py-3 text-sm text-stone-700 shadow-sm">
                {message}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function MessageSegments({
  segments,
  isAssistant,
}: {
  segments: RecipePickerMessageSegment[];
  isAssistant: boolean;
}) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "recipe") {
          return (
            <Link
              key={`${segment.recipeId}-${index}`}
              href={`/recipe/${segment.recipeId}`}
              className={cn(
                "underline decoration-current/40 underline-offset-4 transition hover:opacity-80",
                isAssistant ? "text-stone-900" : "text-white",
              )}
            >
              {segment.label}
            </Link>
          );
        }

        return <span key={`text-${index}`}>{segment.text}</span>;
      })}
    </>
  );
}

function resolveActiveIndex(
  recipes: RecipePickerCard[],
  activeRecipeId: string | null,
  fallbackIndex: number,
) {
  if (!activeRecipeId) {
    return Math.min(fallbackIndex, Math.max(0, recipes.length - 1));
  }

  const index = recipes.findIndex(
    (recipe) => recipe.recipeId === activeRecipeId,
  );
  if (index >= 0) {
    return index;
  }

  return Math.min(fallbackIndex, Math.max(0, recipes.length - 1));
}

function resolveScrollerGap(scroller: HTMLDivElement) {
  const styles = window.getComputedStyle(scroller);
  const gapValue = styles.columnGap || styles.gap || "0";
  const parsed = Number.parseFloat(gapValue);
  return Number.isFinite(parsed) ? parsed : 0;
}
