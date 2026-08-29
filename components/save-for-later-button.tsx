"use client";

import { useActionState, useEffect, useOptimistic, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { toggleSaveForLaterAction } from "@/lib/actions/operations";
import type { ActionState } from "@/lib/actions/types";

const initialState: ActionState = { status: "idle", message: "" };

export function SaveForLaterButton({
  recipeId,
  initiallySaved,
}: {
  recipeId: string;
  initiallySaved: boolean;
}) {
  const [state, toggleSaveForLater] = useActionState(toggleSaveForLaterAction, initialState);
  const [isSaved, setOptimisticSaved] = useOptimistic(initiallySaved);
  const [, startTransition] = useTransition();
  const isTogglingRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      isTogglingRef.current = false;
      toast.success(state.message);
      router.refresh();
    } else if (state.status === "error") {
      isTogglingRef.current = false;
      toast.error(state.message);
      router.refresh();
    }
  }, [router, state]);

  function toggle() {
    if (isTogglingRef.current) return;

    isTogglingRef.current = true;
    const formData = new FormData();
    formData.set("recipeId", recipeId);
    startTransition(() => {
      setOptimisticSaved(!isSaved);
      toggleSaveForLater(formData);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10 rounded-full p-0 hover:bg-transparent"
      aria-label={isSaved ? "Remove from Saved for later" : "Save recipe for later"}
      aria-pressed={isSaved}
      title={isSaved ? "Remove from Saved for later" : "Save recipe for later"}
      onClick={toggle}
    >
      <Bookmark className={isSaved ? "size-5 fill-current" : "size-5"} />
    </Button>
  );
}
