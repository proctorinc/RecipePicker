"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag } from "lucide-react";
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
  const [isSaved, setIsSaved] = useState(initiallySaved);
  const [state, formAction, pending] = useActionState(toggleSaveForLaterAction, initialState);
  const router = useRouter();

  useEffect(() => {
    setIsSaved(initiallySaved);
  }, [initiallySaved]);

  useEffect(() => {
    if (state.status === "success") {
      setIsSaved((saved) => !saved);
      toast.success(state.message);
      router.refresh();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [router, state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="recipeId" value={recipeId} />
      <Button
        type="submit"
        variant="secondary"
        size="icon"
        className="size-7 rounded-full"
        aria-label={isSaved ? "Remove from Save for later" : "Save for later"}
        title={isSaved ? "Remove from Save for later" : "Save for later"}
        disabled={pending}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Tag className={isSaved ? "size-4 fill-current" : "size-4"} />}
      </Button>
    </form>
  );
}
