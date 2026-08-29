"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function RecipeDescription({ description }: { description: string }) {
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const descriptionId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    if (isExpanded) return;

    const element = descriptionRef.current;
    if (!element) return;

    const updateCanExpand = () => {
      setCanExpand(element.scrollHeight > element.clientHeight + 1);
    };

    updateCanExpand();
    const observer = new ResizeObserver(updateCanExpand);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description, isExpanded]);

  useEffect(() => {
    setIsExpanded(false);
  }, [description]);

  return (
    <div>
      <p
        ref={descriptionRef}
        id={descriptionId}
        className={cn(
          "whitespace-pre-wrap text-sm text-muted-foreground sm:text-base",
          !isExpanded && "line-clamp-4",
        )}
      >
        {description}
      </p>
      {canExpand ? (
        <button
          type="button"
          aria-controls={descriptionId}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="mt-1 text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
